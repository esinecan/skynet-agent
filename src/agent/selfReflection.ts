/**
 * Self-reflective reasoning implementation for the Skynet Agent
 * Enables the agent to evaluate and improve its own responses
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { WorkflowError } from '../utils/errorHandler';
import { generateResponse } from './llmClient';
import { updateComponentHealth, HealthStatus } from '../utils/health';

const logger = createLogger('selfReflection');

// Configuration
const REFLECTION_DIR = process.env.REFLECTION_DIR || path.join(process.cwd(), 'data', 'reflections');

// Reflection modes
export enum ReflectionMode {
  QUICK = 'quick',
  THOROUGH = 'thorough'
}

/**
 * Initialize the self-reflection system
 */
export function initializeSelfReflection(): void {
  try {
    // Create reflection directory if it doesn't exist
    if (!fs.existsSync(REFLECTION_DIR)) {
      fs.mkdirSync(REFLECTION_DIR, { recursive: true });
    }
    
    // Update health status
    updateComponentHealth(
      'selfReflection',
      HealthStatus.HEALTHY,
      'Self-reflection system initialized'
    );
    
    logger.info('Self-reflection system initialized', {
      reflectionDir: REFLECTION_DIR
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to initialize self-reflection system', err);
    
    // Update health status
    updateComponentHealth(
      'selfReflection',
      HealthStatus.DEGRADED,
      'Failed to initialize self-reflection system'
    );
  }
}

/**
 * Perform self-reflection on an AI response
 * @param userQuery The original user query
 * @param aiResponse The AI's response to evaluate
 * @param mode Reflection mode (quick or thorough)
 * @param generateImprovement Whether to generate an improved response
 * @returns Reflection results including score, critique, and optionally an improved response
 */
export async function performSelfReflection(
  userQuery: string,
  aiResponse: string,
  mode: ReflectionMode = ReflectionMode.QUICK,
  generateImprovement: boolean = false
): Promise<{
  score: number;
  critique: string;
  improvedResponse?: string;
}> {
  try {
    logger.info(`Performing ${mode} self-reflection`, {
      queryLength: userQuery.length,
      responseLength: aiResponse.length
    });
    
    // Update health status
    updateComponentHealth(
      'selfReflection',
      HealthStatus.BUSY,
      'Performing self-reflection'
    );
    
    // Choose reflection method based on mode
    let result;
    if (mode === ReflectionMode.THOROUGH) {
      result = await performThoroughReflection(userQuery, aiResponse, generateImprovement);
    } else {
      result = await performQuickReflection(userQuery, aiResponse, generateImprovement);
    }
    
    // Log the result
    logger.info('Self-reflection completed', {
      score: result.score,
      critiqueLength: result.critique.length,
      hasImprovedResponse: !!result.improvedResponse
    });
    
    // Update health status
    updateComponentHealth(
      'selfReflection',
      HealthStatus.HEALTHY,
      'Self-reflection completed successfully'
    );
    
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Self-reflection failed', err);
    
    // Update health status
    updateComponentHealth(
      'selfReflection',
      HealthStatus.DEGRADED,
      'Self-reflection failed'
    );
    
    // Return a default result
    return {
      score: 0,
      critique: 'Self-reflection failed due to an error'
    };
  }
}

/**
 * Perform a quick self-reflection
 * This is a simpler, faster evaluation for routine responses
 */
async function performQuickReflection(
  userQuery: string,
  aiResponse: string,
  generateImprovement: boolean
): Promise<{
  score: number;
  critique: string;
  improvedResponse?: string;
}> {
  // Create the reflection prompt
  const reflectionPrompt = `
    You are an AI assistant evaluating the quality of a response to a user query.
    
    User Query: "${userQuery}"
    
    AI Response: "${aiResponse}"
    
    Please evaluate the response on a scale of 1-10 and provide a brief critique.
    Focus on:
    1. Accuracy and relevance to the query
    2. Completeness of the answer
    3. Clarity and helpfulness
    4. Tone and professionalism
    
    Format your response as:
    Score: [1-10]
    Critique: [Your critique]
    ${generateImprovement ? 'Improved Response: [Your improved version of the response]' : ''}
  `;
  
  // Generate the reflection
  const reflection = await generateResponse([
    { role: "system", content: reflectionPrompt }
  ]);
  
  // Parse the reflection
  const scoreMatch = reflection.match(/Score:\s*(\d+)/i);
  const critiqueMatch = reflection.match(/Critique:\s*([\s\S]*?)(?:Improved Response:|$)/i);
  const improvedMatch = generateImprovement ? 
    reflection.match(/Improved Response:\s*([\s\S]*?)$/i) : null;
  
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5;
  const critique = critiqueMatch ? critiqueMatch[1].trim() : 'No critique provided';
  const improvedResponse = improvedMatch ? improvedMatch[1].trim() : undefined;
  
  return {
    score,
    critique,
    improvedResponse
  };
}

/**
 * Perform a thorough self-reflection
 * This is a more detailed, multi-step evaluation for complex responses
 */
async function performThoroughReflection(
  userQuery: string,
  aiResponse: string,
  generateImprovement: boolean
): Promise<{
  score: number;
  critique: string;
  improvedResponse?: string;
}> {
  // Step 1: Identify key aspects of the user query
  const queryAnalysisPrompt = `
    You are an AI assistant analyzing a user query to identify key aspects that need to be addressed.
    
    User Query: "${userQuery}"
    
    Please identify:
    1. The main question or request
    2. Any specific constraints or requirements
    3. The implied knowledge level of the user
    4. The expected format or depth of the response
    
    Format your response as a concise analysis of what an ideal response should address.
  `;
  
  const queryAnalysis = await generateResponse([
    { role: "system", content: queryAnalysisPrompt }
  ]);
  
  // Step 2: Evaluate the response against the query analysis
  const evaluationPrompt = `
    You are an AI assistant evaluating the quality of a response to a user query.
    
    User Query: "${userQuery}"
    
    Query Analysis: "${queryAnalysis}"
    
    AI Response: "${aiResponse}"
    
    Please evaluate the response on a scale of 1-10 and provide a detailed critique.
    Focus on:
    1. Accuracy and relevance to the query
    2. Completeness of the answer
    3. Clarity and helpfulness
    4. Tone and professionalism
    5. Logical structure and flow
    6. Appropriate level of detail for the user
    
    Format your response as:
    Score: [1-10]
    Critique: [Your detailed critique with specific examples]
  `;
  
  const evaluation = await generateResponse([
    { role: "system", content: evaluationPrompt }
  ]);
  
  // Parse the evaluation
  const scoreMatch = evaluation.match(/Score:\s*(\d+)/i);
  const critiqueMatch = evaluation.match(/Critique:\s*([\s\S]*?)$/i);
  
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5;
  const critique = critiqueMatch ? critiqueMatch[1].trim() : 'No critique provided';
  
  // Step 3: Generate an improved response if requested
  let improvedResponse: string | undefined;
  
  if (generateImprovement) {
    const improvementPrompt = `
      You are an AI assistant tasked with improving a response to a user query.
      
      User Query: "${userQuery}"
      
      Original Response: "${aiResponse}"
      
      Critique of Original Response: "${critique}"
      
      Please provide an improved version of the response that addresses the critique.
      Focus on maintaining your own voice while improving the content and addressing any issues.
    `;
    
    improvedResponse = await generateResponse([
      { role: "system", content: improvementPrompt }
    ]);
  }
  
  return {
    score,
    critique,
    improvedResponse
  };
}

/**
 * Perform multi-step reasoning for complex problems
 * This is a more advanced form of self-reflection that breaks down complex problems
 */
export async function performMultiStepReasoning(
  userQuery: string,
  initialThoughts: string = ''
): Promise<{
  steps: string[];
  finalAnswer: string;
}> {
  try {
    logger.info('Performing multi-step reasoning', {
      queryLength: userQuery.length
    });
    
    // Step 1: Break down the problem
    const breakdownPrompt = `
      You are an AI assistant breaking down a complex problem into steps.
      
      User Query: "${userQuery}"
      ${initialThoughts ? `Initial Thoughts: "${initialThoughts}"` : ''}
      
      Please break down this problem into 3-5 clear steps that need to be addressed.
      For each step, explain what needs to be determined and why it's important.
      
      Format your response as:
      Step 1: [Description]
      Step 2: [Description]
      ...and so on
    `;
    
    const breakdown = await generateResponse([
      { role: "system", content: breakdownPrompt }
    ]);
    
    // Step 2: Execute each step
    const stepMatches = breakdown.match(/Step \d+:.*?(?=Step \d+:|$)/gs) || [];
    const steps: string[] = [];
    
    for (const stepMatch of stepMatches) {
      const stepDescription = stepMatch.trim();
      steps.push(stepDescription);
      
      // For each step, generate reasoning
      const stepPrompt = `
        You are an AI assistant working through a step in a multi-step reasoning process.
        
        User Query: "${userQuery}"
        
        Problem Breakdown:
        ${breakdown}
        
        Current Step: "${stepDescription}"
        
        Previous Steps and Reasoning:
        ${steps.slice(0, -1).join('\n')}
        
        Please provide detailed reasoning for this step. Be thorough and consider multiple perspectives.
      `;
      
      const stepReasoning = await generateResponse([
        { role: "system", content: stepPrompt }
      ]);
      
      steps.push(stepReasoning);
    }
    
    // Step 3: Generate final answer
    const finalPrompt = `
      You are an AI assistant providing a final answer after multi-step reasoning.
      
      User Query: "${userQuery}"
      
      Reasoning Steps:
      ${steps.join('\n\n')}
      
      Based on the above reasoning, please provide a comprehensive final answer to the user's query.
      Make sure your answer is clear, accurate, and addresses all aspects of the query.
    `;
    
    const finalAnswer = await generateResponse([
      { role: "system", content: finalPrompt }
    ]);
    
    logger.info('Multi-step reasoning completed', {
      steps: steps.length,
      finalAnswerLength: finalAnswer.length
    });
    
    return {
      steps,
      finalAnswer
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Multi-step reasoning failed', err);
    
    // Return a default result
    return {
      steps: ['Error: Failed to complete multi-step reasoning'],
      finalAnswer: 'I apologize, but I encountered an error while processing your query. Please try again or rephrase your question.'
    };
  }
}
