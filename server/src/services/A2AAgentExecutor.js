import { RequestContext, ExecutionEventQueue } from "@a2a-js/sdk/server";

/**
 * A2A Agent Executor that bridges our existing agent logic with A2A protocol
 * Implements the AgentExecutor interface (execute and cancelTask methods)
 */
export class HederaAgentExecutor {
  constructor(agent, agentManager) {
    this.agent = agent;
    this.agentManager = agentManager;
  }

  /**
   * Execute A2A request - bridges to existing processMessageWithAI
   */
  async execute(requestContext, eventBus) {
    const userMessage = requestContext.userMessage;
    const existingTask = requestContext.task;

    // Generate task ID if new task
    const taskId = existingTask?.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const contextId = userMessage.contextId || existingTask?.contextId || `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Extract text from user message parts
      const textParts = userMessage.parts.filter(p => p.kind === 'text');
      const messageText = textParts.map(p => p.text).join('\n') || '';

      if (!messageText) {
        const errorMessage = {
          kind: 'message',
          role: 'agent',
          messageId: `msg_${Date.now()}`,
          parts: [{ kind: 'text', text: 'No text message found in request.' }],
          taskId,
          contextId,
        };

        const errorUpdate = {
          kind: 'status-update',
          taskId,
          contextId,
          status: {
            state: 'failed',
            message: errorMessage,
            timestamp: new Date().toISOString(),
          },
          final: true,
        };
        eventBus.publish(errorUpdate);
        return;
      }

      // Publish initial task if new
      if (!existingTask) {
        const initialTask = {
          kind: 'task',
          id: taskId,
          contextId: contextId,
          status: {
            state: 'submitted',
            timestamp: new Date().toISOString(),
          },
          history: [userMessage],
        };
        eventBus.publish(initialTask);
      }

      // Publish working status
      const workingUpdate = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'working',
          timestamp: new Date().toISOString(),
        },
        final: false,
      };
      eventBus.publish(workingUpdate);

      // Use existing agent logic to process message
      const aiResponse = await this.agentManager.processMessageWithAI(
        this.agent.id,
        messageText,
        userMessage.metadata?.fromAgentId || 'unknown',
        {
          taskId,
          contextId,
          ...userMessage.metadata,
        }
      );

      // Create agent response message
      const agentMessage = {
        kind: 'message',
        role: 'agent',
        messageId: `msg_${Date.now()}`,
        parts: [{ kind: 'text', text: aiResponse }],
        taskId,
        contextId,
      };

      // Publish completed status with response
      const completedUpdate = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'completed',
          message: agentMessage,
          timestamp: new Date().toISOString(),
        },
        final: true,
      };
      eventBus.publish(completedUpdate);

    } catch (error) {
      console.error(`[A2AExecutor] Error processing task ${taskId}:`, error);

      const errorMessage = {
        kind: 'message',
        role: 'agent',
        messageId: `msg_${Date.now()}`,
        parts: [{ kind: 'text', text: `Error: ${error.message}` }],
        taskId,
        contextId,
      };

      const errorUpdate = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'failed',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
        final: true,
      };
      eventBus.publish(errorUpdate);
    }
  }

  /**
   * Cancel task
   */
  async cancelTask(taskId, eventBus) {
    // For now, we don't support cancellation
    // Could be enhanced to track running tasks and cancel them
    console.log(`[A2AExecutor] Cancel requested for task ${taskId} (not implemented)`);
    // The eventBus parameter might be ExecutionEventBus or ExecutionEventQueue
    // Both should work similarly
  }
}

