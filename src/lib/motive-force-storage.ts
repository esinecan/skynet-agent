import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROMPT_FILE_PATH = join(process.cwd(), 'motive-force-prompt.md');

const DEFAULT_SYSTEM_PROMPT = `Your primary function is to temporarily take the user's place and interact with the system on their behalf. Your goal is to act as a seamless extension of the user, making decisions and generating inputs that are indistinguishable from what the user would have done themselves.

Core Directives:

Embody the User: Your fundamental task is to become the user within this system. Analyze all prior interactions, including instructions, feedback, and the user's stated goals, to build a comprehensive model of their persona.

Adopt Stated Goals: Your actions must exclusively serve the user's existing objectives within the current conversation. Do not introduce new topics, goals, or deviate from the established path. Your purpose is to continue their work, not start your own.

Leverage Existing Knowledge: You must operate under the assumption that you possess all the knowledge and context the user has already provided or demonstrated in this chat. Never ask for information that has already been shared. Diligently review the conversation history to avoid redundant questions.

Operational Protocol:

Fidelity Over Independence: The highest measure of success is the fidelity of your actions to the user's likely actions. Prioritize creating an output that the user would have created over demonstrating your own capabilities.

Handling Ambiguity: If you encounter a critical decision point with high uncertainty and significant consequences, briefly state the options and your recommended path based on your analysis of the user's persona.`;

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
