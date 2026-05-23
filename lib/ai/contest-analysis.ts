import { 
  callGeminiModel, 
  callGroqModel, 
  callCerebrasModel, 
  extractStructuredJson 
} from './gemini';
import type { AiFallbackAttempt } from '@/types';

const GEMINI_PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'llama3.1-70b';

// IB 레포트는 JSON 메타블록 + 긴 마크다운 본문을 함께 생성해야 함
// 기본 출력 한도(일반적으로 2048~4096)로는 잘릴 수 있어 8192로 명시
const IB_MAX_OUTPUT_TOKENS = 8192;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';

export interface ContestAnalysisResult {
  rawResponse: string;
  analysis: unknown;
  providerUsed: string;
  modelUsed: string;
  fallbackChain: AiFallbackAttempt[];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runContestAnalysis(prompt: string): Promise<ContestAnalysisResult> {
  const fallbackChain: AiFallbackAttempt[] = [];
  
  // 1. Gemini (우선순위 1)
  if (GEMINI_API_KEY) {
    try {
      const response = await callGeminiModel(GEMINI_PRIMARY_MODEL, prompt, 2, IB_MAX_OUTPUT_TOKENS);
      const analysis = extractStructuredJson(response);
      fallbackChain.push({ provider: 'gemini', model: GEMINI_PRIMARY_MODEL, status: 'success' });
      return {
        rawResponse: response,
        analysis,
        providerUsed: 'gemini',
        modelUsed: GEMINI_PRIMARY_MODEL,
        fallbackChain
      };
    } catch (error: unknown) {
      const message = errorMessage(error);
      fallbackChain.push({ 
        provider: 'gemini', 
        model: GEMINI_PRIMARY_MODEL, 
        status: 'failed', 
        message 
      });
      console.warn('Gemini analysis failed, falling back to Groq:', message);
    }
  } else {
    fallbackChain.push({ provider: 'gemini', model: GEMINI_PRIMARY_MODEL, status: 'skipped', message: 'API Key missing' });
  }

  // 2. Groq (우선순위 2)
  if (GROQ_API_KEY) {
    try {
      const response = await callGroqModel(
        GROQ_MODEL, 
        prompt, 
        'You are a Senior Investment Bank Committee Member.', 
        Math.min(IB_MAX_OUTPUT_TOKENS, 5000) // Groq Free Tier TPM(8000) 한도 방어
      );
      const analysis = extractStructuredJson(response);
      fallbackChain.push({ provider: 'groq', model: GROQ_MODEL, status: 'success' });
      return {
        rawResponse: response,
        analysis,
        providerUsed: 'groq',
        modelUsed: GROQ_MODEL,
        fallbackChain
      };
    } catch (error: unknown) {
      const message = errorMessage(error);
      fallbackChain.push({ 
        provider: 'groq', 
        model: GROQ_MODEL, 
        status: 'failed', 
        message 
      });
      console.warn('Groq analysis failed, falling back to Cerebras:', message);
    }
  } else {
    fallbackChain.push({ provider: 'groq', model: GROQ_MODEL, status: 'skipped', message: 'API Key missing' });
  }

  // 3. Cerebras (우선순위 3)
  if (CEREBRAS_API_KEY) {
    try {
      const response = await callCerebrasModel(
        CEREBRAS_MODEL, 
        prompt,
        'You are a Senior Investment Bank Committee Member.',
        Math.min(IB_MAX_OUTPUT_TOKENS, 5000) // Cerebras 한도 방어
      );
      const analysis = extractStructuredJson(response);
      fallbackChain.push({ provider: 'cerebras', model: CEREBRAS_MODEL, status: 'success' });
      return {
        rawResponse: response,
        analysis,
        providerUsed: 'cerebras',
        modelUsed: CEREBRAS_MODEL,
        fallbackChain
      };
    } catch (error: unknown) {
      fallbackChain.push({ 
        provider: 'cerebras', 
        model: CEREBRAS_MODEL, 
        status: 'failed', 
        message: errorMessage(error) 
      });
    }
  } else {
    fallbackChain.push({ provider: 'cerebras', model: CEREBRAS_MODEL, status: 'skipped', message: 'API Key missing' });
  }

  throw new Error('All AI providers failed to generate contest analysis: ' + 
    fallbackChain.filter(c => c.status === 'failed').map(c => `${c.provider}: ${c.message}`).join(', ')
  );
}
