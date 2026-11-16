import { isCloud, sb } from './backend';

/**
 * Optional: let a language model phrase the manager's replies more freely.
 * Off by default. It turns on when VITE_AI_FUNCTION names the deployed Edge Function (see supabase/README.md).
 * The model only ever receives the facts the engine computed, never a way to look anything up on its own.
 */
const FUNCTION_NAME = import.meta.env.VITE_AI_FUNCTION as string | undefined;

export const modelEnabled = isCloud && Boolean(FUNCTION_NAME);

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/** Returns the model's reply, or null if it is off or fails, so the caller can fall back to the built-in engine. */
export async function askModel(question: string, history: ChatTurn[], context: string): Promise<string | null> {
    if (!modelEnabled || !FUNCTION_NAME) return null;
    try {
        const { data, error } = await sb().functions.invoke(FUNCTION_NAME, { body: { question, history: history.slice(-8), context } });
        if (error || !data || typeof data.reply !== 'string' || !data.reply.trim()) return null;
        return data.reply.trim();
    } catch {
        return null;
    }
}
