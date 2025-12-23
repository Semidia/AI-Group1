/**
 * AI推演引擎服务
 * 封装AI API调用、Prompt构建、结果解析等功能
 */

import axios, { AxiosRequestConfig } from 'axios';
import { logger } from '../utils/logger';

export interface AIConfig {
  provider?: string | null;
  endpoint?: string | null;
  headers?: Record<string, unknown> | null;
  bodyTemplate?: Record<string, unknown> | null;
}

export interface InferenceRequest {
  sessionId: string;
  round: number;
  decisions: Array<{
    playerIndex: number;
    username: string;
    nickname?: string;
    actionText?: string;
    selectedOptionIds?: unknown;
    actionType?: string;
    actionData?: unknown;
    hostModified?: boolean;
    hostModification?: unknown;
  }>;
  activeEvents: Array<{
    id: string;
    eventType: string;
    eventContent: string;
    effectiveRounds: number;
    progress: Record<string, unknown>;
    round: number;
  }>;
  gameRules: string;
  currentRound: number;
}

export interface InferenceResult {
  sessionId: string;
  round: number;
  result: {
    narrative?: string;
    outcomes?: Array<{
      playerIndex: number;
      outcome: string;
      resources?: Record<string, unknown>;
    }>;
    events?: Array<{
      type: string;
      description: string;
    }>;
    nextRoundHints?: string;
  };
  status: 'completed' | 'failed';
  error?: string;
  completedAt: Date;
}

export class AIService {
  private static instance: AIService;
  private defaultRetries = 3;
  private defaultTimeout = 60000; // 60秒超时

  private constructor() { }

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * 构建AI Prompt
   */
  buildPrompt(request: InferenceRequest, gameRules: string): string {
    const { decisions, activeEvents, currentRound } = request;

    let prompt = `# 游戏推演请求 - 第 ${currentRound} 回合\n\n`;

    // 游戏规则
    if (gameRules) {
      prompt += `## 游戏规则\n${gameRules} \n\n`;
    }

    // 活跃事件（包含详细进度信息）
    if (activeEvents && activeEvents.length > 0) {
      prompt += `## 活跃事件和规则\n`;
      activeEvents.forEach((event, index) => {
        prompt += `${index + 1}.[${event.eventType}] ${event.eventContent} \n`;
        if (event.progress && typeof event.progress === 'object') {
          const progress = event.progress as { current?: number; total?: number; lastUpdatedRound?: number };
          if (progress.current !== undefined && progress.total !== undefined) {
            const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
            prompt += `   进度: ${progress.current}/${progress.total} 回合 (${percentage}%)\n`;
            if (progress.lastUpdatedRound !== undefined) {
              prompt += `   上次更新: 第 ${progress.lastUpdatedRound} 回合\n`;
            }
          }
        }
        prompt += `   有效回合数: ${event.effectiveRounds}\n`;
        prompt += `   创建回合: 第 ${event.round} 回合\n`;
      });
      prompt += `\n`;
    }

    // 玩家决策
    prompt += `## 玩家决策\n`;
    decisions.forEach((decision) => {
      prompt += `玩家 ${decision.playerIndex} (${decision.nickname || decision.username}):\n`;
      if (decision.actionText) {
        prompt += `  行动: ${decision.actionText}\n`;
      }
      if (decision.selectedOptionIds) {
        prompt += `  选择: ${JSON.stringify(decision.selectedOptionIds)}\n`;
      }
      if (decision.hostModified && decision.hostModification) {
        prompt += `  [主持人修改] ${JSON.stringify(decision.hostModification)}\n`;
      }
      prompt += `\n`;
    });

    // 推演要求
    prompt += `## 推演要求\n`;
    prompt += `请根据以上信息进行推演，生成以下内容：\n`;
    prompt += `1. 剧情叙述：描述本轮游戏的发展情况\n`;
    prompt += `2. 结果：每个玩家的行动结果和资源变化\n`;
    prompt += `3. 事件：本轮发生的新事件\n`;
    prompt += `4. 下一回合提示：为下一回合提供背景信息\n`;

    return prompt;
  }

  /**
   * 根据配置构建请求体
   */
  buildRequestBody(config: AIConfig, prompt: string): Record<string, unknown> {
    const { bodyTemplate } = config;

    if (bodyTemplate && typeof bodyTemplate === 'object') {
      // 如果有模板，使用模板并替换占位符
      const body = JSON.parse(JSON.stringify(bodyTemplate));

      // 替换常见的占位符
      const bodyStr = JSON.stringify(body);
      const replaced = bodyStr
        .replace(/\{\{prompt\}\}/g, prompt)
        .replace(/\{\{PROMPT\}\}/g, prompt);

      try {
        return JSON.parse(replaced);
      } catch {
        // 如果替换后不是有效JSON，直接使用模板
        return body;
      }
    }

    // 默认请求体格式（OpenAI风格）
    return {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: '你是一个游戏推演引擎，根据玩家的决策和游戏规则，生成游戏剧情和结果。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    };
  }

  /**
   * 调用AI API
   */
  async callAI(
    config: AIConfig,
    prompt: string,
    retries = this.defaultRetries
  ): Promise<InferenceResult['result']> {
    if (!config.endpoint) {
      throw new Error('AI API endpoint not configured');
    }

    const axiosConfig: AxiosRequestConfig = {
      method: 'POST',
      url: config.endpoint,
      headers: {
        'Content-Type': 'application/json',
        ...((config.headers as Record<string, string>) || {}),
      },
      data: this.buildRequestBody(config, prompt),
      timeout: this.defaultTimeout,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`Calling AI API (attempt ${attempt}/${retries}): ${config.endpoint}`);
        const response = await axios(axiosConfig);

        // 解析响应（根据不同的AI服务提供商可能有不同的格式）
        return this.parseResponse(response.data, config.provider || 'default');
      } catch (error: any) {
        lastError = error;
        logger.warn(`AI API call failed (attempt ${attempt}/${retries}):`, error.message);

        if (attempt < retries) {
          // 指数退避重试
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`AI API call failed after ${retries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * 解析AI响应（支持多种格式）
   */
  private parseResponse(data: unknown, provider: string): InferenceResult['result'] {
    // 默认解析逻辑（OpenAI格式）
    if (provider === 'openai' || provider === 'default') {
      if (typeof data === 'object' && data !== null) {
        const obj = data as Record<string, unknown>;

        // OpenAI格式：{ choices: [{ message: { content: "..." } }] }
        if (obj.choices && Array.isArray(obj.choices) && obj.choices.length > 0) {
          const choice = obj.choices[0] as Record<string, unknown>;
          if (choice.message && typeof choice.message === 'object') {
            const message = choice.message as Record<string, unknown>;
            if (message.content && typeof message.content === 'string') {
              return this.parseNarrativeResponse(message.content);
            }
          }
        }

        // 直接返回结果格式
        if (obj.result) {
          return obj.result as InferenceResult['result'];
        }

        // 如果响应本身就是结果格式
        if (obj.narrative || obj.outcomes) {
          return obj as InferenceResult['result'];
        }
      }
    }

    // 其他提供商的解析逻辑可以在这里添加
    // 例如：anthropic, google, custom等

    // 如果无法解析，返回默认格式
    logger.warn(`Unable to parse AI response for provider: ${provider}, using default format`);
    return {
      narrative: typeof data === 'string' ? data : JSON.stringify(data),
    };
  }

  /**
   * 解析文本格式的推演结果
   */
  private parseNarrativeResponse(content: string): InferenceResult['result'] {
    // 简单的文本解析逻辑
    // 实际项目中可以使用更复杂的解析，比如JSON提取、Markdown解析等

    return {
      narrative: content,
      // 可以尝试从文本中提取结构化信息
      outcomes: [],
      events: [],
    };
  }

  /**
   * 执行推演（完整流程）
   */
  async performInference(
    config: AIConfig,
    request: InferenceRequest
  ): Promise<InferenceResult['result']> {
    const prompt = this.buildPrompt(request, request.gameRules);
    logger.info(`Built prompt for session ${request.sessionId}, round ${request.round}`);

    const result = await this.callAI(config, prompt);
    logger.info(`AI inference completed for session ${request.sessionId}, round ${request.round}`);

    return result;
  }
}

export const aiService = AIService.getInstance();

