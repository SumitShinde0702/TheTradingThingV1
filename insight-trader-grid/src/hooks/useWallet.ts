import { useState } from 'react';
import { ethers } from 'ethers';
import { toast } from 'sonner';

const HEDERA_TESTNET = {
  chainId: '0x128', // 296 in hex
  chainName: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: ['https://testnet.hashio.io/api'],
  blockExplorerUrls: ['https://hashscan.io/testnet'],
};

export function useWallet() {
  const [wallet, setWallet] = useState<ethers.Signer | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connectWallet = async (): Promise<{ signer: ethers.Signer | null; address: string }> => {
    if (typeof (window as any).ethereum !== 'undefined') {
      setIsConnecting(true);
      try {
        // Request Hedera testnet connection
        await (window as any).ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [HEDERA_TESTNET],
        });

        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();

        setWallet(signer);
        setAddress(addr);
        toast.success('Wallet connected!');
        
        return { signer, address: addr };
      } catch (error: any) {
        console.error('Wallet connection failed:', error);
        toast.error(error.message || 'Failed to connect wallet');
        throw error;
      } finally {
        setIsConnecting(false);
      }
    } else {
      // Simulated wallet for demo
      const simulatedAddress = '0x0000000000000000000000000000000000000000';
      setAddress(simulatedAddress);
      toast.info('Using simulated wallet for demo');
      return { signer: null, address: simulatedAddress };
    }
  };

  const disconnectWallet = () => {
    setWallet(null);
    setAddress(null);
    toast.success('Wallet disconnected');
  };

  return { wallet, address, isConnecting, connectWallet, disconnectWallet };
}
