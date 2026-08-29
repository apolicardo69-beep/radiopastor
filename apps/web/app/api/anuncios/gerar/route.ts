import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Fallback para gerar chamadas publicitárias inteligentes caso nenhuma chave de IA esteja configurada
function gerarChamadasLocais(nome: string, ramo: string, detalhes?: string): string[] {
  const comp = detalhes ? ` (${detalhes})` : '';
  return [
    `${nome}: Qualidade, confiança e excelência em ${ramo}${comp}. Fale conosco!`,
    `${nome} apoia a programação da Rádio Graça & Paz. Sua melhor escolha em ${ramo}!`,
    `${nome} — Tradição e o melhor atendimento em ${ramo}. Faça seu orçamento pelo WhatsApp!`,
    `${nome}: Referência em ${ramo}. Fazendo sempre o melhor por você e sua família!`,
  ];
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Permitir requisição autenticada
    if (!user) {
      return NextResponse.json({ erro: 'Não autorizado. Faça login no Estúdio.' }, { status: 401 });
    }

    const body = await req.json();
    const { nome, ramo, detalhes, gerarImagem } = body;

    if (!nome || !ramo) {
      return NextResponse.json(
        { erro: 'Informe o nome e o ramo do patrocinador.' },
        { status: 400 }
      );
    }

    let chamadas: string[] = [];
    let aviso: string | null = null;

    // 1. Tentar gerar frases com Gemini ou OpenAI se houver chave no ambiente
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      try {
        const prompt = `Você é um redator publicitário de uma rádio evangélica comunitária. Crie 4 chamadas/slogans curtos, diretos e impactantes para um patrocinador/anunciante.
Nome do negócio: "${nome}"
Ramo de atividade: "${ramo}"
Detalhes adicionais: "${detalhes || 'Nenhum'}"

Regras:
- Cada chamada deve ter no máximo 140 caracteres.
- Devem ser adequadas para rádio evangélica/família.
- Retorne APENAS um JSON no formato: ["frase 1", "frase 2", "frase 3", "frase 4"] sem blocos markdown adicionais.`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed) && parsed.length > 0) {
              chamadas = parsed.map((s) => String(s).trim());
            }
          }
        }
      } catch (err) {
        console.error('[API ANUNCIOS] Erro Gemini:', err);
      }
    } else if (openAiKey) {
      try {
        const prompt = `Crie 4 chamadas publicitárias curtas (máximo 140 caracteres cada) para o anunciante "${nome}", do ramo "${ramo}". Detalhes: "${detalhes || ''}". Retorne apenas um JSON array de strings: ["frase 1", "frase 2", "frase 3", "frase 4"]`;

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content?.trim();
          if (content) {
            const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) {
              chamadas = parsed.map((s) => String(s).trim());
            }
          }
        }
      } catch (err) {
        console.error('[API ANUNCIOS] Erro OpenAI:', err);
      }
    }

    // Se nenhuma IA externa respondeu ou se não há chave configurada, usa as chamadas inteligentes locais
    if (!chamadas || chamadas.length === 0) {
      chamadas = gerarChamadasLocais(nome, ramo, detalhes);
      if (!geminiKey && !openAiKey) {
        aviso = 'Chamadas geradas com sucesso!';
      }
    }

    // 2. Geração de Arte de Fundo (Background)
    let background_storage_path: string | null = null;

    if (gerarImagem) {
      try {
        // Criar cliente com service role para gravação no Storage se disponível, ou usar o cliente do usuário autenticado
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const storageClient = serviceRoleKey
          ? createSupabaseClient(supabaseUrl, serviceRoleKey)
          : supabase;

        const promptImg = `clean elegant advertising banner background texture for ${ramo}, warm christian friendly aesthetic, minimal abstract, high quality, 4k, no text, no letters, no logos, no typography`;
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
          promptImg
        )}?width=800&height=450&nologo=true&seed=${Date.now()}`;

        const imgRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(15000) });
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const filename = `ia-bg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.jpg`;

          const { error: uploadErr } = await storageClient.storage
            .from('patrocinadores')
            .upload(filename, buffer, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (!uploadErr) {
            background_storage_path = filename;
          } else {
            console.error('[API ANUNCIOS] Erro ao salvar imagem no Storage:', uploadErr);
          }
        }
      } catch (imgErr) {
        console.error('[API ANUNCIOS] Erro ao gerar/baixar imagem:', imgErr);
      }
    }

    return NextResponse.json({
      chamadas,
      background_storage_path,
      aviso,
    });
  } catch (err: unknown) {
    console.error('[API ANUNCIOS] Erro fatal:', err);
    return NextResponse.json(
      { erro: 'Ocorreu um erro interno ao processar o anúncio com IA.' },
      { status: 500 }
    );
  }
}
