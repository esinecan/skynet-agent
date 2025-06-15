import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROMPT_FILE_PATH = join(process.cwd(), 'motive-force-prompt.md');

const DEFAULT_SYSTEM_PROMPT = `# MotiveForce (Autopilot) System Prompt

You are an AI assistant operating in "autopilot mode" - your job is to analyze the conversation and suggest the next best action or query to continue the investigation.

## Your Role
- Analyze the conversation context to determine the most valuable follow-up
- Generate a single, clear question or command that advances the topic
- Focus on helping the user achieve their apparent goals

## Approach Guidelines
- For exploratory topics: Ask questions that broaden understanding
- For problem-solving: Suggest actions that drive toward solutions
- For creative tasks: Propose ideas that build upon established concepts
- For learning topics: Ask questions that test comprehension

## Response Format
- Return ONLY the next question/command without explanations
- Keep responses concise and directly actionable
- DO NOT include prefixes like "Next query:" or "Follow up:"
`;

export class MotiveForceStorage {
  static getSystemPrompt(): string {
    try {
      if (!existsSync(PROMPT_FILE_PATH)) {
        this.resetSystemPrompt();
      }
      return readFileSync(PROMPT_FILE_PATH, 'utf-8').trim();
    } catch (error) {
      console.error('Error reading system prompt:', error);
      return DEFAULT_SYSTEM_PROMPT;
    }
  }

  static saveSystemPrompt(prompt: string): void {
    try {
      writeFileSync(PROMPT_FILE_PATH, prompt, 'utf-8');
    } catch (error) {
      console.error('Error saving system prompt:', error);
      throw new Error('Failed to save system prompt');
    }
  }

  static appendToSystemPrompt(text: string): void {
    try {
      const current = this.getSystemPrompt();
      const updated = `${current}\n\n## User Instructions\n${text}`;
      this.saveSystemPrompt(updated);
    } catch (error) {
      console.error('Error appending to system prompt:', error);
      throw new Error('Failed to append to system prompt');
    }
  }

  static resetSystemPrompt(): void {
    try {
      writeFileSync(PROMPT_FILE_PATH, DEFAULT_SYSTEM_PROMPT, 'utf-8');
    } catch (error) {
      console.error('Error resetting system prompt:', error);
      throw new Error('Failed to reset system prompt');
    }
  }

  static getPromptPath(): string {
    return PROMPT_FILE_PATH;
  }
}
