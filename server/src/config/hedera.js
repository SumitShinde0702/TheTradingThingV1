/**
 * Hedera Testnet Configuration
 */
export const HEDERA_CONFIG = {
  // Owner Account (Server/Agents wallet)
  OWNER_ACCOUNT_ID: "0.0.7170260",
  OWNER_EVM_ADDRESS: "0x987effd3acba1cf13968bc0c3af3fd661e07c62e",
  OWNER_PRIVATE_KEY: "0x88921444661772c1e5bc273d5f9d00099c189a3294de9f85eae65307d80fbd67",
  
  // Client/Customer Account (for testing payments)
  CLIENT_ACCOUNT_ID: "0.0.7174458",
  CLIENT_EVM_ADDRESS: "0x1fef1c22bbf2e66bc575c8b433d75588ab2aea92",
  CLIENT_PRIVATE_KEY: "0x06a0a3da5723988cdd989c371de7f77953c36cc27eb4c288cf03dc6c629b2e12",
  
  // Main Account (Owner - used by agents and server)
  ACCOUNT_ID: "0.0.7170260", // Alias for owner
  EVM_ADDRESS: "0x987effd3acba1cf13968bc0c3af3fd661e07c62e", // Alias for owner
  PRIVATE_KEY: "0x88921444661772c1e5bc273d5f9d00099c189a3294de9f85eae65307d80fbd67", // Alias for owner
  
  // Contract Addresses
  IDENTITY_REGISTRY: "0x4c74ebd72921d537159ed2053f46c12a7d8e5923",
  REPUTATION_REGISTRY: "0xc565edcba77e3abeade40bfd6cf6bf583b3293e0",
  VALIDATION_REGISTRY: "0x18df085d85c586e9241e0cd121ca422f571c2da6",
  
  // Network Configuration
  RPC_URL: "https://testnet.hashio.io/api",
  CHAIN_ID: 296,
  NETWORK: "hedera-testnet",
  
  // Mirror Node
  MIRROR_NODE_URL: "https://testnet.mirrornode.hedera.com/api/v1",
  
  // JSON RPC
  JSON_RPC_URL: "https://testnet.hashio.io/api"
};

