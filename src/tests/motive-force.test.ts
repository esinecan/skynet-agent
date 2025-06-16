import { MotiveForceService, getMotiveForceService } from '../lib/motive-force';
import { MotiveForceStorage } from '../lib/motive-force-storage';
import { ChatMessage } from '../lib/chat-history';
import { LLMService } from '../lib/llm-service'; // For mocking prototype
import { RAGService, getRAGService } from '../lib/rag'; // For mocking RAG

// Mock MotiveForceStorage
jest.mock('../lib/motive-force-storage');

// Mock LLMService parts
jest.mock('../lib/llm-service', () => {
  return {
    LLMService: jest.fn().mockImplementation(() => {
      return {
        initialize: jest.fn().mockResolvedValue(undefined),
        getModelAndTools: jest.fn().mockResolvedValue({
          model: 'mock-model-from-llm-service',
          tools: {},
        }),
        // Add any other methods that might be called, e.g., by constructor or initialize
        initializeModel: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

// Define the mock instance first
const mockRagServiceActualInstance = {
  initialize: jest.fn(),
  retrieveAndFormatContext: jest.fn(),
  addDocument: jest.fn(),
  vectorSearch: jest.fn(),
};

// Mock RAGService parts
jest.mock('../lib/rag', () => ({
  // Note: We are using the pre-defined mockRagServiceActualInstance here.
  // This works because of how Jest handles mocks and module loading,
  // but be mindful of hoisting if issues arise.
  getRAGService: jest.fn(() => mockRagServiceActualInstance),
  RAGService: jest.fn(() => mockRagServiceActualInstance)
}));

// Mock config loader to prevent file access
jest.mock('../config/default-mcp-servers', () => ({
  loadMCPConfig: jest.fn().mockReturnValue({
    mcp: {
      url: 'http://localhost:7878/mcp',
      apiKey: 'test-mcp-key',
      version: '1.0',
    },
    knowledgeGraph: {
      url: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'password',
    },
    llmProviders: [
      { provider: 'google', apiKeyEnv: 'GOOGLE_API_KEY', models: ['gemini-test'] }
    ]
  }),
  // If there are other exports from this module, mock them as needed
}));

// Mock 'ai' package for streamText
jest.mock('ai', () => ({
  ...jest.requireActual('ai'), // Import and retain default exports
  streamText: jest.fn(),
}));

// Define mocked streamText from 'ai' for easier access in tests
const mockStreamText = require('ai').streamText;

describe('MotiveForceService.generateNextQuery', () => {
  let service: MotiveForceService;
  const mockMessages: ChatMessage[] = [
    { id: '1', role: 'user', content: 'Hello world', createdAt: new Date() },
    { id: '2', role: 'assistant', content: 'Hi there!', createdAt: new Date() },
    { id: '3', role: 'user', content: 'How are you?', createdAt: new Date() },
  ];

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // LLMService is now fully mocked by jest.mock above, its constructor won't run original code.
    // Ensure getMotiveForceService uses the mocked LLMService.

    // Clear and set defaults for the shared RAG service mock instance
    mockRagServiceActualInstance.initialize.mockClear().mockResolvedValue(undefined);
    mockRagServiceActualInstance.retrieveAndFormatContext.mockClear().mockResolvedValue({ memories: [], context: '' });
    mockRagServiceActualInstance.addDocument.mockClear().mockResolvedValue(undefined);
    mockRagServiceActualInstance.vectorSearch.mockClear().mockResolvedValue([]);

    // Set a dummy API key for tests if any part of the code still tries to access it directly
    process.env.GOOGLE_API_KEY = 'test-google-api-key';

    // Setup default mocks for MotiveForceStorage
    (MotiveForceStorage.getSystemPrompt as jest.Mock).mockReturnValue('Default system prompt.');
    (MotiveForceStorage.appendToSystemPrompt as jest.Mock).mockClear(); // Already cleared by clearAllMocks, but good for emphasis
    (MotiveForceStorage.resetSystemPrompt as jest.Mock).mockClear();

    // Setup default mock for streamText
    mockStreamText.mockResolvedValue({
      textStream: (async function* () { yield "Test query"; })(), // Simulate async generator
      toolCalls: [],
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, // Add usage for completeness
      rawResponse: {}, // Add rawResponse
      experimental_toolCallStreaming: false, // Add experimental_toolCallStreaming
    });

    // Initialize the service with default config (RAG/memory off)
    // Note: getMotiveForceService might internally create a new LLMService instance.
    // The mock for LLMService should ensure this instance is the mocked one.
    service = getMotiveForceService({
      useRag: false,
      useConsciousMemory: false,
      provider: 'google',
      model: 'gemini-test-model'
    });
    // The actual LLMService constructor is mocked, so service.initialize() will call the mock.
    await service.initialize();
  });

  afterEach(() => {
    delete process.env.GOOGLE_API_KEY; // Clean up env variable
  });

  describe('isInitiatingAutopilot: true', () => {
    const userMessage: ChatMessage = { id: 'u1', role: 'user', content: 'Last user message content', createdAt: new Date() };
    const messagesWithUserLast: ChatMessage[] = [
      { id: 'a1', role: 'assistant', content: 'Previous assistant message', createdAt: new Date() },
      userMessage,
    ];

    test('1.1: should append user\'s last message to system prompt and use it, and exclude last user message from conversation', async () => {
      const initialPrompt = 'Initial system prompt.';
      const appendedMessage = "user's last message was as follows: Last user message content";
      const finalPrompt = `${initialPrompt}\n\n## User Instructions\n${appendedMessage}`;

      (MotiveForceStorage.getSystemPrompt as jest.Mock)
        .mockReturnValueOnce(initialPrompt) // First call
        .mockReturnValueOnce(finalPrompt);  // Second call (after append)

      await service.generateNextQuery(messagesWithUserLast, 'session123', true);

      expect(MotiveForceStorage.appendToSystemPrompt).toHaveBeenCalledTimes(1);
      expect(MotiveForceStorage.appendToSystemPrompt).toHaveBeenCalledWith(appendedMessage);

      expect(mockStreamText).toHaveBeenCalledTimes(1);
      const streamTextCallArgs = mockStreamText.mock.calls[0][0];
      expect(streamTextCallArgs.messages[0].role).toBe('system');
      expect(streamTextCallArgs.messages[0].content).toBe(finalPrompt);

      // Check that the last user message is NOT in the conversation messages passed to LLM
      const conversationMessages = streamTextCallArgs.messages.slice(1);
      expect(conversationMessages.find((m: ChatMessage) => m.content === 'Last user message content')).toBeUndefined();
      // And it should contain the message before the last user message
      expect(conversationMessages.find((m: ChatMessage) => m.content === 'Previous assistant message')).toBeDefined();

    });

    test('1.2: should not append if no user message exists in history', async () => {
      const messagesWithoutUser: ChatMessage[] = [
        { id: 'a1', role: 'assistant', content: 'Only assistant message', createdAt: new Date() }
      ];
      (MotiveForceStorage.getSystemPrompt as jest.Mock).mockReturnValue('Default system prompt.');

      await service.generateNextQuery(messagesWithoutUser, 'session123', true);

      expect(MotiveForceStorage.appendToSystemPrompt).not.toHaveBeenCalled();
      expect(mockStreamText).toHaveBeenCalledTimes(1);
      const streamTextCallArgs = mockStreamText.mock.calls[0][0];
      expect(streamTextCallArgs.messages[0].content).toBe('Default system prompt.');
    });

    test('1.3: should not append if last user message content is empty', async () => {
      const messagesWithEmptyUser: ChatMessage[] = [
        { id: 'a1', role: 'assistant', content: 'Assistant message', createdAt: new Date() },
        { id: 'u1', role: 'user', content: '', createdAt: new Date() },
      ];
      (MotiveForceStorage.getSystemPrompt as jest.Mock).mockReturnValue('Default system prompt.');

      await service.generateNextQuery(messagesWithEmptyUser, 'session123', true);
      expect(MotiveForceStorage.appendToSystemPrompt).not.toHaveBeenCalled();
    });
  });

  describe('isInitiatingAutopilot: false', () => {
    const userMessage: ChatMessage = { id: 'u1', role: 'user', content: 'A regular user message', createdAt: new Date() };
    const messagesWithUser: ChatMessage[] = [
      { id: 'a1', role: 'assistant', content: 'Assistant response', createdAt: new Date() },
      userMessage,
    ];

    test('2.1: should NOT append user\'s last message and use existing system prompt, and exclude last user message from conversation', async () => {
      const existingPrompt = 'Existing prompt, possibly with prior user instructions.';
      (MotiveForceStorage.getSystemPrompt as jest.Mock).mockReturnValue(existingPrompt);

      await service.generateNextQuery(messagesWithUser, 'session456', false);

      expect(MotiveForceStorage.appendToSystemPrompt).not.toHaveBeenCalled();
      expect(mockStreamText).toHaveBeenCalledTimes(1);
      const streamTextCallArgs = mockStreamText.mock.calls[0][0];
      expect(streamTextCallArgs.messages[0].role).toBe('system');
      expect(streamTextCallArgs.messages[0].content).toBe(existingPrompt);

      // Check that the last user message is NOT in the conversation messages passed to LLM
      const conversationMessages = streamTextCallArgs.messages.slice(1);
      expect(conversationMessages.find((m: ChatMessage) => m.content === 'A regular user message')).toBeUndefined();
      // And it should contain the message before the last user message
      expect(conversationMessages.find((m: ChatMessage) => m.content === 'Assistant response')).toBeDefined();
    });
  });

  describe('General behavior', () => {
    test("3.1: should not include the old dynamic 'Context: Last Message from User' block", async () => {
      await service.generateNextQuery(mockMessages, 'session789', false); // isInitiatingAutopilot doesn't matter here

      expect(mockStreamText).toHaveBeenCalledTimes(1);
      const streamTextCallArgs = mockStreamText.mock.calls[0][0];
      const systemContent = streamTextCallArgs.messages[0].content;
      expect(systemContent).not.toContain('## Context: Last Message from User Before Takeover');
    });

    test('3.2: should include additionalContext if RAG is used and returns context', async () => {
      const originalConfig = service.getConfig(); // Get current config to restore later
      service.updateConfig({ useRag: true }); // Enable RAG for this test
      // Ensure initialize is called if updateConfig resets it (depends on updateConfig logic)
      // await service.initialize(); // Re-initialize if needed. Based on code, it's not strictly needed if only config.useRag changes.

      const ragContext = 'Relevant RAG context.';
      // Configure the shared mock instance for this test
      mockRagServiceActualInstance.retrieveAndFormatContext.mockResolvedValue({
        memories: [{ text: ragContext, score: 0.9, id: 'rag1', embedding: [], metadata: {} }],
        context: `\n\n## Relevant Context from Memory:\n- ${ragContext}`, // Simulating formatted output
      });
      (MotiveForceStorage.getSystemPrompt as jest.Mock).mockReturnValue('Base prompt.');

      const userQueryForRAG: ChatMessage[] = [{ id: 'ragQuery', role: 'user', content: 'Query for RAG', createdAt: new Date() }];
      await service.generateNextQuery(userQueryForRAG, 'sessionRAG', false); // Use the main 'service' instance

      expect(mockRagServiceActualInstance.retrieveAndFormatContext).toHaveBeenCalledWith('Query for RAG');
      expect(mockStreamText).toHaveBeenCalledTimes(1);
      const streamTextCallArgs = mockStreamText.mock.calls[0][0];
      const systemContent = streamTextCallArgs.messages[0].content;
      expect(systemContent).toContain('Base prompt.');
      expect(systemContent).toContain('Relevant RAG context.');
      expect(systemContent).not.toContain('## Context: Last Message from User Before Takeover');

      service.updateConfig(originalConfig); // Restore original config
    });

    test('3.3: conversation history sent to LLM should be sliced correctly (historyDepth and last message removal)', async () => {
      const originalConfig = service.getConfig();
      const historyDepth = 5;
      service.updateConfig({ historyDepth, useRag: false, useConsciousMemory: false });
      // await service.initialize(); // If updateConfig makes it necessary

      const deepMessages: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: `m${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        createdAt: new Date(Date.now() + i * 1000),
      }));
      // Last message is 'Message 9' (user)

      await service.generateNextQuery(deepMessages, 'sessionDepthTest', false);

      expect(mockStreamText).toHaveBeenCalledTimes(1);
      const streamTextCallArgs = mockStreamText.mock.calls[0][0];
      const conversationMessages = streamTextCallArgs.messages.slice(1); // Exclude system prompt

      // Expected length: historyDepth - 1 (because last message is removed)
      // Messages are from Message 9 (removed) back historyDepth elements, then remove Message 9.
      // So, if historyDepth is 5, messages are m9, m8, m7, m6, m5. m9 is removed. So m8,m7,m6,m5. Length 4.
      expect(conversationMessages.length).toBe(historyDepth - 1);
      expect(conversationMessages[0].content).toBe('Message 5'); // (10 - 5 = 5) -> m5 is the first after slicing from end
      expect(conversationMessages[conversationMessages.length - 1].content).toBe('Message 8'); // m8 is the one before m9 (last)
      expect(conversationMessages.find((m: ChatMessage) => m.content === 'Message 9')).toBeUndefined(); // Last message removed
      expect(conversationMessages.find((m: ChatMessage) => m.content === 'Message 0')).toBeUndefined(); // Oldest messages pruned

      service.updateConfig(originalConfig); // Restore original config
    });
  });
});
