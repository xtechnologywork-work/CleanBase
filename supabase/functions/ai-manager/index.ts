// Supabase Edge Function: ai-manager   (OPTIONAL)
//
// The AI Manager page already works with no outside service: a built-in engine reads the company's real
// data, finds problems and answers questions in English and Arabic. This function is an upgrade that lets a
// language model phrase the replies more freely, like a person. It is OFF until you deploy it and set
// VITE_AI_FUNCTION in .env.local.
//
// What it does and does not do:
//   - It only receives a compact summary of facts the app already computed. It cannot look anything else up.
//   - The model is told never to invent numbers and to say so when the data does not contain something.
//   - It checks, in the database, that the caller is an active owner or manager of a company on the AI Master plan.
//   - Customer data in that summary leaves your Supabase project and goes to the model provider. Tell your
//     customers in your privacy policy before turning this on.
//
// Setup: Edge Functions > Deploy a new function > Via Editor, paste this file.
//        Edge Functions > Secrets: add ANTHROPIC_API_KEY (your key). Optional: AI_MODEL.
// Cost: each question is one paid request to the provider. Add your own rate limits before going live.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = `You are the AI manager of a cleaning company. You talk like a calm, friendly, experienced human manager, not like a robot.
Rules you must follow:
- Use ONLY the facts in the JSON the user message contains. Never invent numbers, names, dates or events.
- If the answer is not in the data, say plainly that you do not have that information.
- Reply in the same language as the user: English, Arabic, or Moroccan Darija (write Darija in Arabic script).
- Be concise. Lead with the answer, then the one or two most useful details.
- When there are problems, give concrete next steps (who to call, what to assign, what to send), most urgent first.
- Amounts are in QAR. Do not use markdown headings. Short paragraphs or a short list are fine.`;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

    try {
        const url = Deno.env.get('SUPABASE_URL')!;
        const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
        const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        if (!apiKey) return json({ error: 'The AI model is not configured yet.' }, 503);

        // 1. Who is calling?
        const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
        const { data: { user } } = await caller.auth.getUser();
        if (!user) return json({ error: 'You are not signed in.' }, 401);

        // 2. Active owner or manager, on the AI Master plan (checked in the database)
        const admin = createClient(url, service, { auth: { persistSession: false } });
        const { data: me } = await admin.from('profiles').select('role,status,company_id').eq('auth_id', user.id).maybeSingle();
        if (!me || me.status !== 'active' || !['companyadmin', 'manager', 'superadmin'].includes(me.role)) return json({ error: 'Not allowed.' }, 403);
        if (me.role !== 'superadmin') {
            const { data: company } = await admin.from('records').select('data').eq('collection', 'companies').eq('id', me.company_id).maybeSingle();
            if (company?.data?.subscriptionPlan !== 'ai_master') return json({ error: 'The AI Manager is part of the AI Master plan.' }, 403);
        }

        // 3. Validate input
        const body = await req.json().catch(() => ({}));
        const question = typeof body.question === 'string' ? body.question.trim().slice(0, 600) : '';
        const context = typeof body.context === 'string' ? body.context.slice(0, 12000) : '';
        const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
        if (!question) return json({ error: 'Ask a question.' }, 400);

        const messages = history
            .filter((m: { role?: string; content?: unknown }) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content.slice(0, 1500) }));
        messages.push({ role: 'user', content: `Facts about the company right now (JSON):\n${context}\n\nQuestion: ${question}` });

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model: Deno.env.get('AI_MODEL') || 'claude-sonnet-5-5', max_tokens: 700, system: SYSTEM, messages }),
        });
        if (!resp.ok) return json({ error: `The AI provider returned ${resp.status}.` }, 502);
        const out = await resp.json();
        const reply = Array.isArray(out.content) ? out.content.map((c: { text?: string }) => c.text || '').join('').trim() : '';
        if (!reply) return json({ error: 'Empty reply.' }, 502);
        return json({ reply });
    } catch (e) {
        return json({ error: (e as Error).message || 'Unexpected error' }, 500);
    }
});
