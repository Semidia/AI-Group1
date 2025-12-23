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
    if (gameRules && gameRules.trim()) {
      prompt += `## 游戏规则\n${gameRules.trim()} \n\n`;
    } else {
      prompt += `## 游戏规则\n（未设置游戏规则）\n\n`;
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
    } else {
      prompt += `## 活跃事件和规则\n（当前无活跃事件）\n\n`;
    }

    // 玩家决策
    prompt += `## 玩家决策\n`;
    if (decisions && decisions.length > 0) {
      decisions.forEach((decision) => {
        prompt += `玩家 ${decision.playerIndex} (${decision.nickname || decision.username}):\n`;
        if (decision.actionText) {
          prompt += `  行动: ${decision.actionText}\n`;
        }
        if (decision.selectedOptionIds) {
          prompt += `  选择: ${JSON.stringify(decision.selectedOptionIds)}\n`;
        }
        if (decision.actionData) {
          prompt += `  行动数据: ${JSON.stringify(decision.actionData)}\n`;
        }
        if (decision.hostModified && decision.hostModification) {
          prompt += `  [主持人修改] ${JSON.stringify(decision.hostModification)}\n`;
        }
        prompt += `\n`;
      });
    } else {
      prompt += `（当前回合暂无玩家决策）\n\n`;
    }

    // 推演要求
    prompt += `## 推演要求\n`;
    prompt += `请根据以上信息进行推演，生成以下内容：\n`;
    prompt += `1. 剧情叙述：描述本轮游戏的发展情况\n`;
    prompt += `2. 结果：每个玩家的行动结果和资源变化\n`;
    prompt += `3. 事件：本轮发生的新事件\n`;
    prompt += `4. 下一回合提示：为下一回合提供背景信息\n`;

    logger.info(`Prompt built successfully`, {
      promptLength: prompt.length,
      hasDecisions: decisions && decisions.length > 0,
      decisionsCount: decisions?.length || 0,
      hasActiveEvents: activeEvents && activeEvents.length > 0,
      activeEventsCount: activeEvents?.length || 0,
      hasGameRules: !!gameRules && gameRules.trim().length > 0,
    });

    return prompt;
  }

  /**
   * 根据配置构建请求体
   */
  buildRequestBody(config: AIConfig, prompt: string): Record<string, unknown> {
    const { bodyTemplate } = config;

    if (bodyTemplate && typeof bodyTemplate === 'object') {
      try {
        // 如果有模板，使用模板并替换占位符
        const body = JSON.parse(JSON.stringify(bodyTemplate));

        // 记录原始模板
        logger.info(`Using bodyTemplate for AI request`, {
          templateKeys: Object.keys(body),
          hasMessages: 'messages' in body,
          templatePreview: JSON.stringify(body).substring(0, 300),
        });

        // 递归替换占位符的函数
        const replacePlaceholders = (obj: any): any => {
          if (typeof obj === 'string') {
            // 如果是字符串，检查是否包含占位符
            if (obj === '{{prompt}}' || obj === '{{PROMPT}}') {
              return prompt;
            }
            // 如果字符串中包含占位符（作为子字符串），也进行替换
            return obj
              .replace(/\{\{prompt\}\}/g, prompt)
              .replace(/\{\{PROMPT\}\}/g, prompt);
          } else if (Array.isArray(obj)) {
            // 如果是数组，递归处理每个元素
            return obj.map(item => replacePlaceholders(item));
          } else if (obj !== null && typeof obj === 'object') {
            // 如果是对象，递归处理每个属性
            const result: any = {};
            for (const key in obj) {
              if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result[key] = replacePlaceholders(obj[key]);
              }
            }
            return result;
          }
          return obj;
        };

        const result = replacePlaceholders(body);
        
        // 验证结果
        if (!result || typeof result !== 'object') {
          throw new Error('Invalid bodyTemplate: result is not an object');
        }

        // 记录构建后的请求体（不记录完整内容，只记录结构）
        logger.info(`Request body built from template`, {
          keys: Object.keys(result),
          hasMessages: 'messages' in result,
          messagesCount: Array.isArray(result.messages) ? result.messages.length : 0,
          model: result.model || 'not set',
          requestBodyPreview: JSON.stringify(result).substring(0, 500),
        });

        return result;
      } catch (error: any) {
        logger.error(`Failed to process bodyTemplate`, {
          error: error.message,
          bodyTemplateType: typeof bodyTemplate,
          stack: error.stack,
        });
        throw new Error(`bodyTemplate处理失败: ${error.message}`);
      }
    }

    // 默认请求体格式（OpenAI风格）
    logger.info(`Using default request body format (OpenAI style)`);
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

    // 构建请求体
    const requestBody = this.buildRequestBody(config, prompt);
    logger.info(`Prepared request body for AI API call`, {
      endpoint: config.endpoint,
      provider: config.provider,
      bodyKeys: Object.keys(requestBody),
      promptLength: prompt.length,
    });

    const axiosConfig: AxiosRequestConfig = {
      method: 'POST',
      url: config.endpoint,
      headers: {
        'Content-Type': 'application/json',
        ...((config.headers as Record<string, string>) || {}),
      },
      data: requestBody,
      timeout: this.defaultTimeout,
    };

    // 记录请求配置（不记录敏感信息）
    logger.info(`AI API request config prepared`, {
      method: axiosConfig.method,
      url: axiosConfig.url,
      headersKeys: Object.keys(axiosConfig.headers || {}),
      hasData: !!requestBody,
      timeout: axiosConfig.timeout,
      requestBodyStructure: requestBody ? {
        keys: Object.keys(requestBody),
        model: requestBody.model,
        hasMessages: 'messages' in requestBody,
        messagesCount: Array.isArray(requestBody.messages) ? requestBody.messages.length : 0,
        messagesPreview: Array.isArray(requestBody.messages) 
          ? requestBody.messages.map((m: any) => ({
              role: m.role,
              contentLength: m.content?.length || 0,
              contentPreview: m.content?.substring(0, 100) || '',
            }))
          : [],
        temperature: requestBody.temperature,
        maxTokens: requestBody.max_tokens || requestBody.maxTokens,
      } : null,
    });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`Calling AI API (attempt ${attempt}/${retries}): ${config.endpoint}`);
        const response = await axios(axiosConfig);

        // 解析响应（根据不同的AI服务提供商可能有不同的格式）
        return this.parseResponse(response.data, config.provider || 'default');
      } catch (error: any) {
        lastError = error;
        
        // 构建详细的错误信息
        let errorMessage = error.message || 'Unknown error';
        
        if (error.response) {
          // HTTP错误响应
          const status = error.response.status;
          const data = error.response.data;
          
          if (status === 401) {
            errorMessage = 'API密钥无效或已过期，请检查Authorization头配置';
          } else if (status === 404) {
            errorMessage = 'API端点不存在，请检查endpoint配置';
          } else if (status === 429) {
            errorMessage = 'API调用频率超限，请稍后重试';
          } else if (status >= 500) {
            errorMessage = `API服务器错误 (${status})，请稍后重试`;
          } else {
            errorMessage = `API请求失败 (${status}): ${JSON.stringify(data)}`;
          }
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          errorMessage = '无法连接到API服务器，请检查endpoint地址和网络连接';
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = '连接超时，请检查网络或增加超时时间';
        }
        
        logger.warn(`AI API call failed (attempt ${attempt}/${retries}): ${errorMessage}`, {
          endpoint: config.endpoint,
          errorCode: error.code,
          statusCode: error.response?.status,
        });

        if (attempt < retries) {
          // 指数退避重试
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    const finalError = new Error(`AI API调用失败（已重试${retries}次）: ${lastError?.message || 'Unknown error'}`);
    (finalError as any).originalError = lastError;
    throw finalError;
  }

  /**
   * 解析AI响应（支持多种格式）
   */
  private parseResponse(data: unknown, provider: string): InferenceResult['result'] {
    if (typeof data !== 'object' || data === null) {
      logger.warn(`AI response is not an object for provider: ${provider}, using default format`);
      return {
        narrative: typeof data === 'string' ? data : JSON.stringify(data),
      };
    }

    const obj = data as Record<string, unknown>;

    // OpenAI/DeepSeek格式：{ choices: [{ message: { content: "..." } }] }
    // DeepSeek API 使用与 OpenAI 兼容的格式
    if (provider === 'openai' || provider === 'deepseek' || provider === 'default') {
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

    // 其他提供商的解析逻辑可以在这里添加
    // 例如：anthropic, google, custom等

    // 如果无法解析，尝试通用解析
    logger.warn(`Unable to parse AI response for provider: ${provider}, attempting generic parse`, {
      responseKeys: Object.keys(obj),
      responsePreview: JSON.stringify(obj).substring(0, 200),
    });

    // 尝试通用解析：查找可能的 content 字段
    if (obj.content && typeof obj.content === 'string') {
      return this.parseNarrativeResponse(obj.content);
    }

    // 如果完全无法解析，返回默认格式
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
    logger.info(`Building prompt for session ${request.sessionId}, round ${request.round}`, {
      decisionsCount: request.decisions?.length || 0,
      activeEventsCount: request.activeEvents?.length || 0,
      gameRulesLength: request.gameRules?.length || 0,
    });

    const prompt = this.buildPrompt(request, request.gameRules);
    logger.info(`Built prompt for session ${request.sessionId}, round ${request.round}`, {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 200) + '...',
    });

    logger.info(`Calling AI API for session ${request.sessionId}, round ${request.round}`, {
      endpoint: config.endpoint,
      provider: config.provider,
    });

    const result = await this.callAI(config, prompt);
    
    logger.info(`AI inference completed for session ${request.sessionId}, round ${request.round}`, {
      hasNarrative: !!result.narrative,
      narrativeLength: result.narrative?.length || 0,
      outcomesCount: result.outcomes?.length || 0,
      eventsCount: result.events?.length || 0,
    });

    return result;
  }
}

export const aiService = AIService.getInstance();

