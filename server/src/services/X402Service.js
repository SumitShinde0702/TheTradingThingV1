import { ethers } from "ethers";
import axios from "axios";
import { HEDERA_CONFIG } from "../config/hedera.js";
import { X402Facilitator } from "./X402Facilitator.js";

/**
 * x402 Payment Service for Hedera
 * Implements HTTP 402 Payment Required protocol
 * Uses facilitator for payment verification (based on x402-hedera spec)
 */
export class X402Service {
  constructor(facilitatorURL = null) {
    this.provider = new ethers.JsonRpcProvider(HEDERA_CONFIG.JSON_RPC_URL);
    this.wallet = new ethers.Wallet(HEDERA_CONFIG.PRIVATE_KEY, this.provider);
    this.mirrorNodeURL = HEDERA_CONFIG.MIRROR_NODE_URL;
    
    // Payment requests tracking
    this.pendingPayments = new Map();
    
    // x402 Facilitator for payment verification
    this.facilitator = new X402Facilitator(facilitatorURL);
  }

  /**
   * Generate x402 Payment Required response
   * Based on x402-hedera specification
   * @param {Object} paymentRequest - Payment request details
   * @returns {Object} - HTTP 402 response format with proper x402 headers
   */
  generatePaymentRequest(paymentRequest) {
    const {
      amount,
      token = "HBAR", // or token address for HTS tokens
      recipient,
      requestId,
      description,
      expiry = Date.now() + 3600000, // 1 hour default
      facilitatorURL = this.facilitator.facilitatorURL
    } = paymentRequest;

    // Convert recipient to proper format (default to owner address - agents receive payments)
    const recipientAddress = recipient || HEDERA_CONFIG.OWNER_EVM_ADDRESS || HEDERA_CONFIG.EVM_ADDRESS;

    // x402 payment request format (based on x402-hedera spec)
    const paymentDetails = {
      requestId: requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: amount.toString(),
      token,
      address: recipientAddress, // x402 uses "address" not "recipient"
      description,
      expiry,
      network: HEDERA_CONFIG.NETWORK,
      chainId: HEDERA_CONFIG.CHAIN_ID.toString(),
      facilitator: facilitatorURL // Facilitator URL for payment processing
    };

    // Store for verification
    this.pendingPayments.set(paymentDetails.requestId, {
      ...paymentDetails,
      recipient: recipientAddress, // Keep for backward compatibility
      status: "pending",
      createdAt: Date.now()
    });

    // x402 standard response headers
    return {
      status: 402,
      "Payment-Required": JSON.stringify(paymentDetails),
      "Payment-Address": recipientAddress,
      "Payment-Amount": amount.toString(),
      "Payment-Token": token,
      "Content-Type": "application/json"
    };
  }

  /**
   * Verify payment transaction using x402 facilitator
   * @param {string|Object} paymentProof - Transaction hash or payment proof object
   * @param {Object} expectedPayment - Expected payment details
   * @returns {Promise<{verified: boolean, txHash?: string}>}
   */
  async verifyPayment(paymentProof, expectedPayment) {
    try {
      // Extract txHash from payment proof
      const txHash = typeof paymentProof === "string" 
        ? paymentProof 
        : paymentProof?.txHash || paymentProof?.paymentProof;

      if (!txHash) {
        return { verified: false, error: "No payment proof provided" };
      }

      // Use facilitator to verify payment
      const verification = await this.facilitator.verifyPayment(
        txHash,
        expectedPayment
      );

      // Update payment status if verified
      if (verification.verified) {
        const requestId = expectedPayment.requestId;
        const payment = this.pendingPayments.get(requestId);
        if (payment) {
          payment.status = "completed";
          payment.txHash = txHash;
          payment.completedAt = Date.now();
        }
      }

      return verification;
    } catch (error) {
      console.error("Error verifying payment:", error);
      return { verified: false, error: error.message };
    }
  }

  /**
   * Parse X-Payment header from request
   * @param {string} paymentHeader - X-Payment header value
   * @returns {Object|null}
   */
  parsePaymentHeader(paymentHeader) {
    try {
      if (!paymentHeader) return null;
      
      // x402 standard: X-Payment header contains payment proof
      // Format can be JSON or simple txHash string
      if (paymentHeader.startsWith("{")) {
        return JSON.parse(paymentHeader);
      }
      
      // Simple txHash format
      return { txHash: paymentHeader };
    } catch (error) {
      console.error("Error parsing payment header:", error);
      return null;
    }
  }

  /**
   * Execute payment transaction (using facilitator)
   * @param {Object} paymentDetails - Payment details
   * @param {string} payerPrivateKey - Optional payer private key
   * @returns {Promise<{txHash: string, status: string}>}
   */
  async executePayment(paymentDetails, payerPrivateKey = null) {
    try {
      // Use facilitator to execute payment
      return await this.facilitator.executePayment(paymentDetails, payerPrivateKey);
    } catch (error) {
      console.error("Error executing payment:", error);
      throw error;
    }
  }

  /**
   * Get payment status
   * @param {string} requestId - Payment request ID
   * @returns {Object|null}
   */
  getPaymentStatus(requestId) {
    return this.pendingPayments.get(requestId) || null;
  }

  /**
   * Check account balance
   * @param {string} address - Account address
   * @returns {Promise<string>}
   */
  async getBalance(address) {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error("Error getting balance:", error);
      throw error;
    }
  }
}

