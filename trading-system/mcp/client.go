package mcp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// Provider AI提供商类型
type Provider string

const (
	ProviderDeepSeek Provider = "deepseek"
	ProviderQwen     Provider = "qwen"
	ProviderGroq     Provider = "groq"
	ProviderCustom   Provider = "custom"
)

// Client AI API配置
type Client struct {
	Provider   Provider
	APIKey     string
	SecretKey  string // 阿里云需要
	BaseURL    string
	Model      string
	Timeout    time.Duration
	UseFullURL bool // 是否使用完整URL（不添加/chat/completions）
	transport  *http.Transport // 可复用的HTTP传输层，用于连接池
	httpClient *http.Client     // 可复用的HTTP客户端
}

func New() *Client {
	// 默认配置 - 使用Groq
	var defaultClient = Client{
		Provider: ProviderGroq,
		BaseURL:  "https://api.groq.com/openai/v1",
		Model:    "llama-3.1-70b-versatile", // Groq's default fast model
		Timeout:  120 * time.Second, // 增加到120秒，因为AI需要分析大量数据
	}
	return &defaultClient
}

// SetDeepSeekAPIKey 设置DeepSeek API密钥
func (cfg *Client) SetDeepSeekAPIKey(apiKey string) {
	cfg.Provider = ProviderDeepSeek
	cfg.APIKey = apiKey
	cfg.BaseURL = "https://api.deepseek.com/v1"
	cfg.Model = "deepseek-chat"
}

// SetQwenAPIKey 设置阿里云Qwen API密钥
func (cfg *Client) SetQwenAPIKey(apiKey, secretKey string) {
	cfg.Provider = ProviderQwen
	cfg.APIKey = apiKey
	cfg.SecretKey = secretKey
	cfg.BaseURL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
	cfg.Model = "qwen-plus" // 可选: qwen-turbo, qwen-plus, qwen-max
}

// SetGroqAPIKey 设置Groq API密钥（支持OpenAI和Qwen模型）
func (cfg *Client) SetGroqAPIKey(apiKey string, model string) {
	cfg.Provider = ProviderGroq
	cfg.APIKey = apiKey
	cfg.BaseURL = "https://api.groq.com/openai/v1"
	// 如果未指定模型，使用默认模型
	if model == "" {
		cfg.Model = "llama-3.1-70b-versatile" // Groq's default fast inference model
	} else {
		cfg.Model = model // 支持 OpenAI 和 Qwen 模型，如: "openai/gpt-4o", "qwen/qwen2.5-72b-instruct"
	}
	// Increase timeout for larger models (70B models are slower)
	if strings.Contains(model, "70b") || strings.Contains(model, "70B") {
		cfg.Timeout = 180 * time.Second // 3 minutes for 70B models
	} else {
		cfg.Timeout = 120 * time.Second // 2 minutes for smaller models
	}
}

// SetCustomAPI 设置自定义OpenAI兼容API
func (cfg *Client) SetCustomAPI(apiURL, apiKey, modelName string) {
	cfg.Provider = ProviderCustom
	cfg.APIKey = apiKey

	// 检查URL是否以#结尾，如果是则使用完整URL（不添加/chat/completions）
	if strings.HasSuffix(apiURL, "#") {
		cfg.BaseURL = strings.TrimSuffix(apiURL, "#")
		cfg.UseFullURL = true
	} else {
		cfg.BaseURL = apiURL
		cfg.UseFullURL = false
	}

	cfg.Model = modelName
	cfg.Timeout = 120 * time.Second
}

// SetClient 设置完整的AI配置（高级用户）
func (cfg *Client) SetClient(Client Client) {
	if Client.Timeout == 0 {
		Client.Timeout = 30 * time.Second
	}
	cfg = &Client
}

// CallWithMessages 使用 system + user prompt 调用AI API（推荐）
func (cfg *Client) CallWithMessages(systemPrompt, userPrompt string) (string, error) {
	if cfg.APIKey == "" {
		return "", fmt.Errorf("AI API密钥未设置，请先调用 SetGroqAPIKey(), SetDeepSeekAPIKey() 或 SetQwenAPIKey()")
	}

	// 重试配置 - 增加重试次数以应对网络不稳定
	maxRetries := 5
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			fmt.Printf("⚠️  AI API调用失败，正在重试 (%d/%d)...\n", attempt, maxRetries)
		}

		result, err := cfg.callOnce(systemPrompt, userPrompt)
		if err == nil {
			if attempt > 1 {
				fmt.Printf("✓ AI API重试成功\n")
			}
			return result, nil
		}

		lastErr = err
		// 如果不是网络错误，不重试
		if !isRetryableError(err) {
			return "", err
		}

		// 重试前等待 - 使用指数退避，但增加初始延迟 (5s, 10s, 20s, 30s)
		// 给Groq服务器更多时间恢复
		if attempt < maxRetries {
			var waitTime time.Duration
			switch attempt {
			case 1:
				waitTime = 5 * time.Second // 第一次重试等待5秒
			case 2:
				waitTime = 10 * time.Second // 第二次重试等待10秒
			case 3:
				waitTime = 20 * time.Second // 第三次重试等待20秒
			case 4:
				waitTime = 30 * time.Second // 第四次重试等待30秒
			default:
				waitTime = 30 * time.Second
			}
			fmt.Printf("⏳ 等待%v后重试...\n", waitTime)
			time.Sleep(waitTime)
		}
	}

	return "", fmt.Errorf("重试%d次后仍然失败: %w", maxRetries, lastErr)
}

// callOnce 单次调用AI API（内部使用）
func (cfg *Client) callOnce(systemPrompt, userPrompt string) (string, error) {
	// 构建 messages 数组
	messages := []map[string]string{}

	// 如果有 system prompt，添加 system message
	if systemPrompt != "" {
		messages = append(messages, map[string]string{
			"role":    "system",
			"content": systemPrompt,
		})
	}

	// 添加 user message
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": userPrompt,
	})

	// 构建请求体
	requestBody := map[string]interface{}{
		"model":       cfg.Model,
		"messages":    messages,
		"temperature": 0.5, // 降低temperature以提高JSON格式稳定性
		"max_tokens":  4000, // 增加token限制以支持完整的chain of thought + JSON响应
	}

	// 注意：response_format 参数仅 OpenAI 支持，DeepSeek/Qwen 不支持
	// 我们通过强化 prompt 和后处理来确保 JSON 格式正确

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("序列化请求失败: %w", err)
	}

	// 创建HTTP请求
	var url string
	if cfg.UseFullURL {
		// 使用完整URL，不添加/chat/completions
		url = cfg.BaseURL
	} else {
		// 默认行为：添加/chat/completions
		url = fmt.Sprintf("%s/chat/completions", cfg.BaseURL)
	}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// 根据不同的Provider设置认证方式
	switch cfg.Provider {
	case ProviderDeepSeek:
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", cfg.APIKey))
	case ProviderQwen:
		// 阿里云Qwen使用API-Key认证
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", cfg.APIKey))
		// 注意：如果使用的不是兼容模式，可能需要不同的认证方式
	case ProviderGroq:
		// Groq使用Bearer token认证（OpenAI兼容）
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", cfg.APIKey))
	default:
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", cfg.APIKey))
	}

	// 发送请求 - 使用连接池和KeepAlive以提高稳定性
	// 初始化可复用的transport和client（如果还没有）
	if cfg.transport == nil {
		cfg.transport = &http.Transport{
			MaxIdleConns:        10,
			MaxIdleConnsPerHost: 2,
			IdleConnTimeout:     90 * time.Second,
			DisableKeepAlives:   false, // 启用KeepAlive以复用连接
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: 30 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		}
		cfg.httpClient = &http.Client{
			Timeout:   cfg.Timeout,
			Transport: cfg.transport,
		}
	}
	resp, err := cfg.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("发送请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API返回错误 (status %d): %s", resp.StatusCode, string(body))
	}

	// 解析响应
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("解析响应失败: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("API返回空响应")
	}

	return result.Choices[0].Message.Content, nil
}

// isRetryableError 判断错误是否可重试
func isRetryableError(err error) bool {
	errStr := err.Error()
	// 网络错误、超时、EOF等可以重试
	retryableErrors := []string{
		"EOF",
		"timeout",
		"connection reset",
		"connection refused",
		"forcibly closed",
		"wsarecv",
		"temporary failure",
		"no such host",
		"broken pipe",
		"network is unreachable",
	}
	for _, retryable := range retryableErrors {
		if strings.Contains(errStr, retryable) {
			return true
		}
	}
	return false
}
