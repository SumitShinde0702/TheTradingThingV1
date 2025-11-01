```
🤝 A2A Agent-to-Agent Communication Example

   Server: http://localhost:8443

📋 Step 1: Discovering agents...
   ✅ Found TradingAgent: ID 40
   ✅ Found PaymentProcessor: ID 41

📇 Step 2: Fetching PaymentProcessor's Agent Card...
   URL: http://localhost:8443/api/agents/41/.well-known/agent-card.json
   ✅ Agent Card retrieved:
      Name: PaymentProcessor
      Description: Handles payment processing and verification
      URL: http://localhost:8443/api/agents/41/a2a
      Skills: Process_payment, Verify, Escrow

🔧 Step 3: Creating A2A Client...
   ✅ A2A Client created for http://localhost:8443/api/agents/41

💬 Step 4: TradingAgent sending message to PaymentProcessor...
   Message: "Hello! I'm TradingAgent. Can you help me process a payment of 1 HBAR for a trading service?"

   Sending A2A message/send request...
Warning: Constructing A2AClient with a URL is deprecated. Please use A2AClient.fromCardUrl() instead.

   ✅ Response received:
   Response type: task
   Task ID: task_1761993302592_haas10sbo
   Task state: completed
   Agent response: "Hello TradingAgent, this is PaymentProcessor. I'd be happy to help you process the payment. To proceed, I just need to verify a few details. Can you please provide the transaction ID, the sender's and recipient's wallet addresses, and confirm that the payment amount is indeed 1 HBAR for the trading service? Once I have this information, I can assist you with processing the payment."

✨ Example complete! TradingAgent successfully communicated with PaymentProcessor using A2A protocol.
```
