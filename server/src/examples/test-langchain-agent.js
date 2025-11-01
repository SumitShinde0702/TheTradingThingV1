/**
 * Test Agent - Simple LangChain + Groq agent with one tool
 *
 * This is a simple test to verify LangChain + Groq integration works.
 * Uses one simple tool (calculator) that's unrelated to the server.
 *
 * Usage:
 *   node src/examples/test-langchain-agent.js
 */

import "dotenv/config"; // Load environment variables
import { createAgent, tool } from "langchain";
import { ChatGroq } from "@langchain/groq";
import * as z from "zod";
import { GROQ_CONFIG } from "../config/groq.js";

// Simple calculator tool (unrelated to server)
const calculator = tool(
  (input) => {
    const { operation, a, b } = input;
    let result;

    switch (operation) {
      case "add":
        result = a + b;
        break;
      case "subtract":
        result = a - b;
        break;
      case "multiply":
        result = a * b;
        break;
      case "divide":
        if (b === 0) {
          return "Error: Division by zero";
        }
        result = a / b;
        break;
      default:
        return "Error: Unknown operation";
    }

    return `${a} ${operation} ${b} = ${result}`;
  },
  {
    name: "calculator",
    description:
      "Perform basic arithmetic operations: add, subtract, multiply, or divide two numbers",
    schema: z.object({
      operation: z
        .enum(["add", "subtract", "multiply", "divide"])
        .describe("The arithmetic operation to perform"),
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
  }
);

// System prompt
const systemPrompt = `You are a helpful AI assistant that can perform calculations.

You have access to a calculator tool that can:
- add: Add two numbers
- subtract: Subtract two numbers
- multiply: Multiply two numbers
- divide: Divide two numbers

When a user asks you to do math, use the calculator tool to get the answer.
Always show your work and explain what you're doing.`;

async function main() {
  console.log("🧪 Testing LangChain + Groq Agent\n");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  );

  if (!GROQ_CONFIG.API_KEY) {
    console.error("❌ Error: GROQ_API_KEY not set in environment");
    console.error(
      "   Please set GROQ_API_KEY in your .env file or environment\n"
    );
    process.exit(1);
  }

  try {
    // Initialize Groq model
    const model = new ChatGroq({
      //   model: "llama-3.3-70b-versatile",
      model: "openai/gpt-oss-120b",
      temperature: 0.7,
      apiKey: GROQ_CONFIG.API_KEY,
    });

    console.log("✅ Groq model initialized\n");

    // Create agent
    const agent = createAgent({
      model: model,
      systemPrompt: systemPrompt,
      tools: [calculator],
    });

    console.log("✅ Agent created with calculator tool\n");

    // Test queries
    const testQueries = [
      "What is 15 multiplied by 23?",
      "Calculate 100 divided by 5",
      "Add 42 and 58",
    ];

    for (const query of testQueries) {
      console.log(`\n📝 User: ${query}\n`);

      console.log("🤔 Agent thinking...\n");

      const response = await agent.invoke({
        messages: [{ role: "user", content: query }],
      });

      console.log("📤 Response:");
      if (response.messages && response.messages.length > 0) {
        const lastMessage = response.messages[response.messages.length - 1];
        console.log(`   ${lastMessage.content}\n`);
      } else {
        console.log(`   ${JSON.stringify(response, null, 2)}\n`);
      }

      console.log(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      );
    }

    // Interactive mode
    console.log(
      "\n💬 Interactive Mode - Enter your questions (type 'exit' to quit):\n"
    );

    const readline = await import("readline");
    const rl = readline.default.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askQuestion = () => {
      rl.question("> ", async (userQuery) => {
        if (
          userQuery.trim().toLowerCase() === "exit" ||
          userQuery.trim().toLowerCase() === "quit"
        ) {
          console.log("\n👋 Goodbye!\n");
          rl.close();
          process.exit(0);
          return;
        }

        if (!userQuery.trim()) {
          askQuestion();
          return;
        }

        try {
          console.log("\n🤔 Agent thinking...\n");

          const response = await agent.invoke({
            messages: [{ role: "user", content: userQuery }],
          });

          console.log("📤 Response:");
          if (response.messages && response.messages.length > 0) {
            // Show all messages to see tool calls
            for (const msg of response.messages) {
              if (msg.role === "tool") {
                console.log(`   🛠️  Tool Result: ${msg.content}\n`);
              } else if (msg.role === "assistant") {
                console.log(`   💬 Assistant: ${msg.content}\n`);
              }
            }
          } else {
            console.log(`   ${JSON.stringify(response, null, 2)}\n`);
          }
        } catch (error) {
          console.error(`   ❌ Error: ${error.message}\n`);
        }

        askQuestion();
      });
    };

    askQuestion();
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error("\nStack:", error.stack);
    }
    process.exit(1);
  }
}

main();
