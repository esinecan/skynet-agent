import { LLMService } from './src/lib/llm-service';

async function testDeepSeekIntegration() {
  console.log('🧪 Testing DeepSeek LLM Integration...\n');

  try {
    // Test with DeepSeek provider
    console.log('1. Testing DeepSeek Provider...');
    const deepSeekService = new LLMService({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: process.env.DEEPSEEK_API_KEY
    });

    await deepSeekService.initialize();
    
    const providerInfo = deepSeekService.getProviderInfo();
    console.log('✅ DeepSeek Service initialized');
    console.log('   Provider:', providerInfo.provider);
    console.log('   Model:', providerInfo.model);

    // Test a simple generation
    const response = await deepSeekService.generateResponse('Hello! Can you tell me about DeepSeek?');
    console.log('✅ DeepSeek Response generated:');
    console.log('   Length:', response.length, 'characters');
    console.log('   Preview:', response.slice(0, 100) + '...\n');

    await deepSeekService.cleanup();

    // Test with environment-based provider selection
    console.log('2. Testing Environment-based Provider Selection...');
    const envService = new LLMService(); // Will use environment variables
    await envService.initialize();
    
    const envProviderInfo = envService.getProviderInfo();
    console.log('✅ Environment Service initialized');
    console.log('   Provider:', envProviderInfo.provider);
    console.log('   Model:', envProviderInfo.model);

    await envService.cleanup();

    console.log('\n🎉 All tests passed! DeepSeek integration is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Add reasoning model test for DeepSeek
async function testDeepSeekReasoning() {
  console.log('\n🧠 Testing DeepSeek Reasoning Model...');

  try {
    const reasoningService = new LLMService({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      apiKey: process.env.DEEPSEEK_API_KEY
    });

    await reasoningService.initialize();
    
    const providerInfo = reasoningService.getProviderInfo();
    console.log('✅ DeepSeek Reasoning Service initialized');
    console.log('   Provider:', providerInfo.provider);
    console.log('   Model:', providerInfo.model);

    // Test reasoning with a complex question
    const response = await reasoningService.generateResponse(
      'How many people will live in the world in 2040? Please reason through your answer.'
    );
    
    console.log('✅ DeepSeek Reasoning Response generated:');
    console.log('   Length:', response.length, 'characters');
    console.log('   Preview:', response.slice(0, 200) + '...\n');

    await reasoningService.cleanup();
  } catch (error: any) {
    console.warn('⚠️  DeepSeek Reasoning test failed (model may not be available):', error.message);
  }
}

// Run the tests
if (require.main === module) {
  testDeepSeekIntegration()
    .then(() => testDeepSeekReasoning())
    .then(() => {
      console.log('\n🏁 All integration tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Integration test suite failed:', error);
      process.exit(1);
    });
}

export { testDeepSeekIntegration, testDeepSeekReasoning };
