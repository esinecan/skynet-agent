#  LLM Provider Support

**Skynet-Agent** supports a wide range of LLM providers, giving you flexibility to choose the best model for your use case, budget, and performance needs.

##  Supported Providers

| Provider                  | Type              | Best For                              | Models Available                                      |
|---------------------------|-------------------|---------------------------------------|-------------------------------------------------------|
| ** Anthropic**          | Cloud             | Advanced reasoning, analysis & safety | `claude-4-sonnet`, `claude-4-opus`                     |
| ** Groq**              | Cloud             | Ultra‑fast inference                  | `grok-3-mini`, `grok-3-beta`                           |
| ** Mistral**            | Cloud             | Natural language & code generation    | `mistral-7b-instruct`, `mistral-coder-7b`               |
| ** OpenAI-Compatible**  | Cloud / Self‑Hosted | Broad ecosystem integration           | `gpt-4o-chat`, `gpt-4o-code`, and more                  |
| ** Ollama**             | Local             | Privacy-focused, truly free           | Any local model (Llama 3, Qwen3, etc.)                  |
| ** Google Gemini**      | Cloud             | Multimodal integration & high speed   | `gemini-2.5-flash`, `gemini-2.5-pro`                    |
| ** DeepSeek**           | Cloud             | Cost‑effective, robust performance    | `deepseek-chat-r1`, `deepseek-coder-r1`                 |

##  Quick Setup

### Installation
```bash
# All providers are already installed
npm install @ai-sdk/anthropic @ai-sdk/groq @ai-sdk/mistral @ai-sdk/openai ollama-ai-provider
```

### Environment Configuration
```env
# Choose your primary provider
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20241022

# Provider API Keys (add only what you need)
ANTHROPIC_API_KEY=sk-ant-your-key
GROQ_API_KEY=gsk_your-groq-key  
MISTRAL_API_KEY=your-mistral-key
OPENAI_API_KEY=sk-your-openai-key
GOOGLE_API_KEY=your-google-key
DEEPSEEK_API_KEY=sk-your-deepseek-key

# For local models
OLLAMA_BASE_URL=http://localhost:11434

# For custom OpenAI-compatible providers
OPENAI_BASE_URL=https://api.together.xyz/v1  # Example: Together.ai
```

##  Provider-Specific Examples

###  **Anthropic** (Best for Complex Reasoning)
```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20241022
```
- **Strengths**: Complex analysis, ethical reasoning, long conversations
- **Models**: `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`

###  **Groq** (Fastest Inference)
```env
LLM_PROVIDER=groq
LLM_MODEL=llama-3.3-70b-versatile
```
- **Strengths**: Ultra-fast responses, real-time applications
- **Models**: `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`

###  **Mistral** (Code Specialist)
```env
LLM_PROVIDER=mistral
LLM_MODEL=mistral-large-latest
```
- **Strengths**: Code generation, European provider
- **Models**: `mistral-large-latest`, `codestral-latest` (new!)

###  **Ollama** (Local & Private)
```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2:latest
```
- **Strengths**: Privacy, zero API costs, offline usage
- **Setup**: Run `ollama serve` first
- **Popular Models**: `llama3.2:latest`, `qwen2.5:14b`, `mistral-nemo:latest`

###  **OpenAI-Compatible** (Maximum Flexibility)
```env
LLM_PROVIDER=openai-compatible
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1  # Or any compatible provider
```

**Popular Compatible Providers:**
| Provider | Base URL | Notable Models |
|----------|----------|----------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o`, `o1-mini` |
| Together.ai | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct` |
| Perplexity | `https://api.perplexity.ai` | `llama-3.1-sonar-huge-128k-online` |

##  Usage Examples

### Environment-Based Configuration
Set your preferred provider globally:
```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20241022
```

### Programmatic Configuration
```typescript
import { LLMService } from './lib/llm-service';

// Use environment defaults
const llm = new LLMService();

// Override for specific use case
const reasoningLLM = new LLMService({
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022'
});

// Fast inference for real-time features
const fastLLM = new LLMService({
  provider: 'groq',
  model: 'llama-3.3-70b-versatile'
});

// Local model for privacy
const localLLM = new LLMService({
  provider: 'ollama',
  model: 'qwen2.5:14b'
});
```

##  Testing Your Setup

1. **Start the application**: `npm run dev`
2. **Check provider status**: The UI shows active provider/model
3. **Test chat**: Go to `http://localhost:3000`

### Command Line Testing
```bash
# Test different providers
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from Anthropic!", "provider": "anthropic"}'

curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Local model test", "provider": "ollama"}'
```

##  Troubleshooting

### Common Issues

**Ollama Connection Issues**
```bash
# Make sure Ollama is running
ollama serve

# Check if model is available
ollama list
```

**API Key Errors**
- Verify environment variables are set correctly
- Check API key format for each provider

**Model Not Found**
- Confirm model name matches provider's API
- Check provider documentation for available models

**Rate Limits**
- Switch to a different provider temporarily
- Use smaller models for development

### Provider Status Check
```typescript
const providerInfo = llm.getProviderInfo();
console.log(`Active: ${providerInfo.provider} - ${providerInfo.model}`);
```

##  Best Practices

### **For Development**
- Use **Ollama** for privacy and zero costs
- Use **Groq** for fast iteration
- Use **Google/DeepSeek** for cost-effective testing

### **For Production**
- Use **Anthropic** for complex reasoning tasks
- Use **Groq** for real-time applications
- Use **Mistral** for code generation features
- Use **OpenAI-compatible** for reliability and broad model access

### **Cost Optimization**
- Start with cheaper models (`claude-3-5-haiku`, `gpt-4o-mini`)
- Use local models for development
- Monitor API usage and switch providers as needed

---

*The beauty of Skynet-Agent is provider flexibility - switch between cloud and local models seamlessly based on your needs!*
