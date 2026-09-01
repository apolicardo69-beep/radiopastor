// Endpoint que gera o anúncio (texto + arte de fundo) para os patrocinadores.
//
// Vai em: app/api/anuncios/gerar/route.ts
//
// ---------------------------------------------------------------------------
// COMO FUNCIONA
// ---------------------------------------------------------------------------
// Texto:  OpenRouter. Se falhar, cai num texto de modelo, montado aqui mesmo,
//         pra tela nunca ficar sem sugestão nenhuma.
// Imagem: OpenRouter (geração de verdade, feita pro ramo do anunciante). Se
//         falhar, baixa uma foto temática de banco de imagens escolhida pela
//         palavra-chave do ramo.
//
// REGRA QUE NÃO PODE SER QUEBRADA: aconteça o que acontecer, o que volta em
// `background_storage_path` é sempre o CAMINHO DE UM ARQUIVO no bucket
// "patrocinadores" — nunca uma URL externa. A tela do ouvinte passa esse
// valor pro getPublicUrl() do Supabase; se ali viesse uma URL completa, o
// endereço montado sairia quebrado e a imagem nunca apareceria. Por isso até
// a foto de banco é baixada e regravada no Storage antes de responder.
//
// ---------------------------------------------------------------------------
// POR QUE ISSO É UM ENDPOINT NO SERVIDOR
// ---------------------------------------------------------------------------
// A chave do OpenRouter nunca pode ir pro navegador: qualquer ouvinte abriria
// o código-fonte e gastaria o crédito da rádio. E por isso também existe a
// checagem de staff logo no começo — sem ela, quem descobrisse a URL poderia
// disparar geração à vontade. Cada chamada custa dinheiro de verdade.
//
// ---------------------------------------------------------------------------
// VARIÁVEIS DE AMBIENTE (Vercel → Settings → Environment Variables)
// ---------------------------------------------------------------------------
//   OPENROUTER_API_KEY      — obrigatória pra geração por IA. Sem ela, o
//                             endpoint continua funcionando, só que sempre
//                             pelo caminho de reserva (texto de modelo + foto
//                             temática).
//   OPENROUTER_TEXT_MODEL   — opcional. Confira os IDs atuais em
//   OPENROUTER_IMAGE_MODEL    https://openrouter.ai/models
//
// Todo erro é registrado com console.error, então dá pra ler o motivo real em
// Vercel → Logs quando algo falhar em produção.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Geração de imagem costuma levar de 10 a 30 segundos.
export const maxDuration = 60;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
const TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || 'google/gemini-2.5-flash';
const IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL || 'bytedance-seed/seedream-4.5';

// Fotos temáticas de reserva, por palavra-chave do ramo. Não são geradas pro
// anunciante — são fotos genéricas de banco de imagens — mas resolvem bem
// quando a geração por IA falha ou não está configurada.
const FOTOS_POR_RAMO: Record<string, string> = {
  marcenaria: 'photo-1538688525198-9b88f6f53126',
  moveis: 'photo-1538688525198-9b88f6f53126',
  padaria: 'photo-1509440159596-0249088772ff',
  confeitaria: 'photo-1509440159596-0249088772ff',
  restaurante: 'photo-1517248135467-4c7edcad34c4',
  lanchonete: 'photo-1550547660-d9450f859349',
  comida: 'photo-1517248135467-4c7edcad34c4',
  mecanica: 'photo-1486006920555-c77dce18193b',
  oficina: 'photo-1486006920555-c77dce18193b',
  carros: 'photo-1486006920555-c77dce18193b',
  veiculos: 'photo-1486006920555-c77dce18193b',
  dentista: 'photo-1629909613654-28e377c37b09',
  odonto: 'photo-1629909613654-28e377c37b09',
  saude: 'photo-1576091160399-112ba8d25d1d',
  clinica: 'photo-1576091160399-112ba8d25d1d',
  farmacia: 'photo-1586015555751-63bb77f4322a',
  drogaria: 'photo-1586015555751-63bb77f4322a',
  barbearia: 'photo-1503951914875-452162b0f3f1',
  barbeiro: 'photo-1503951914875-452162b0f3f1',
  salao: 'photo-1560066984-138dadb4c035',
  estetica: 'photo-1560066984-138dadb4c035',
  beleza: 'photo-1560066984-138dadb4c035',
  construcao: 'photo-1503387762-592deb58ef4e',
  engenharia: 'photo-1503387762-592deb58ef4e',
  arquitetura: 'photo-1503387762-592deb58ef4e',
  reforma: 'photo-1503387762-592deb58ef4e',
  roupas: 'photo-1441986300917-64674bd600d8',
  moda: 'photo-1441986300917-64674bd600d8',
  calcados: 'photo-1441986300917-64674bd600d8',
  loja: 'photo-1441986300917-64674bd600d8',
  tecnologia: 'photo-1518770660439-4636190af475',
  software: 'photo-1518770660439-4636190af475',
  sistemas: 'photo-1518770660439-4636190af475',
  automacao: 'photo-1518770660439-4636190af475',
  informatica: 'photo-1518770660439-4636190af475',
  celular: 'photo-1511707171634-5f897ff02aa9',
  contabilidade: 'photo-1497366216548-37526070297c',
  contador: 'photo-1497366216548-37526070297c',
  advocacia: 'photo-1589829545856-d10d557cf95f',
  advogado: 'photo-1589829545856-d10d557cf95f',
  juridico: 'photo-1589829545856-d10d557cf95f',
  imobiliaria: 'photo-1560518883-ce09059eeffa',
  imoveis: 'photo-1560518883-ce09059eeffa',
  corretor: 'photo-1560518883-ce09059eeffa',
  mercado: 'photo-1534723452862-4c874018d66d',
  supermercado: 'photo-1534723452862-4c874018d66d',
  mercearia: 'photo-1534723452862-4c874018d66d',
  acougue: 'photo-1534723452862-4c874018d66d',
  academia: 'photo-1534438327276-14e5300c3a48',
  fitness: 'photo-1534438327276-14e5300c3a48',
  esporte: 'photo-1534438327276-14e5300c3a48',
  pet: 'photo-1587300003388-59208cc962cb',
  veterinaria: 'photo-1587300003388-59208cc962cb',
  igreja: 'photo-1438232992991-995b7058bbb3',
  gospel: 'photo-1438232992991-995b7058bbb3',
  livraria: 'photo-1524995997946-a1c2e315a42f',
  papelaria: 'photo-1524995997946-a1c2e315a42f',
  default: 'photo-1557683316-973673baf926',
};

interface CorpoRequisicao {
  nome: string;
  ramo: string;
  detalhes?: string;
  cidade?: string;
  gerarImagem?: boolean;
}

type Imagem = { bytes: Uint8Array; tipo: string };

export async function POST(request: Request) {
  // --- Só pastor/moderador pode gerar (cada chamada custa) -----------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: 'Você precisa estar logado no Estúdio.' }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil) {
    return NextResponse.json(
      { erro: 'Só a equipe da locução pode gerar anúncios.' },
      { status: 403 }
    );
  }

  // --- Entrada -------------------------------------------------------------
  let corpo: CorpoRequisicao;
  try {
    corpo = (await request.json()) as CorpoRequisicao;
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const nome = (corpo.nome || '').trim();
  const ramo = (corpo.ramo || '').trim();
  const detalhes = (corpo.detalhes || '').trim();
  const cidade = (corpo.cidade || '').trim();

  if (!nome || !ramo) {
    return NextResponse.json(
      { erro: 'Informe pelo menos o nome do anunciante e o ramo do negócio.' },
      { status: 400 }
    );
  }

  const chaveIA = process.env.OPENROUTER_API_KEY || '';
  const avisos: string[] = [];

  // --- 1. Texto ------------------------------------------------------------
  let chamadas: string[];
  if (chaveIA) {
    try {
      chamadas = await gerarChamadasIA(chaveIA, { nome, ramo, detalhes, cidade });
    } catch (e) {
      console.error('[ANUNCIOS] texto por IA falhou:', e);
      avisos.push(
        'Não consegui escrever com IA (' + mensagem(e) + '). As sugestões abaixo são de modelo.'
      );
      chamadas = chamadasDeModelo(nome, ramo);
    }
  } else {
    avisos.push('OPENROUTER_API_KEY não configurada — usando textos de modelo.');
    chamadas = chamadasDeModelo(nome, ramo);
  }

  // --- 2. Arte de fundo ----------------------------------------------------
  // O pastor pode desmarcar a caixinha pra só regerar o texto, sem pagar por
  // uma imagem nova.
  let caminhoImagem: string | null = null;

  if (corpo.gerarImagem !== false) {
    let imagem: Imagem | null = null;

    if (chaveIA) {
      try {
        imagem = await gerarArteIA(chaveIA, { ramo, detalhes });
      } catch (e) {
        console.error('[ANUNCIOS] imagem por IA falhou:', e);
        avisos.push('Não consegui gerar a arte com IA (' + mensagem(e) + ').');
      }
    }

    if (!imagem) {
      try {
        imagem = await baixarFotoTematica(ramo);
        avisos.push('Usei uma foto temática de banco de imagens no lugar da arte gerada.');
      } catch (e) {
        console.error('[ANUNCIOS] foto de reserva falhou:', e);
        avisos.push('Também não consegui buscar uma foto de reserva (' + mensagem(e) + ').');
      }
    }

    if (imagem) {
      try {
        caminhoImagem = await salvarNoStorage(supabase, imagem, nome);
      } catch (e) {
        console.error('[ANUNCIOS] upload no Storage falhou:', e);
        avisos.push('Consegui a imagem mas não salvei: ' + mensagem(e));
      }
    }
  }

  return NextResponse.json({
    chamadas,
    background_storage_path: caminhoImagem,
    aviso: avisos.length > 0 ? avisos.join(' ') : null,
  });
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'erro desconhecido';
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------
async function gerarChamadasIA(
  chave: string,
  dados: { nome: string; ramo: string; detalhes: string; cidade: string }
): Promise<string[]> {
  const prompt = [
    'Você escreve chamadas curtas de apoio cultural para uma rádio de igreja no interior da Bahia.',
    '',
    'Anunciante: ' + dados.nome,
    'Ramo: ' + dados.ramo,
    dados.cidade ? 'Atende: ' + dados.cidade : '',
    dados.detalhes ? 'Informações: ' + dados.detalhes : '',
    '',
    'Escreva 3 opções de chamada, cada uma com no máximo 70 caracteres.',
    'Linguagem simples e calorosa, do jeito que se fala no rádio.',
    'Não use emoji, não use ponto de exclamação em excesso, não invente',
    'preço, desconto, prazo nem nada que não foi informado acima.',
    '',
    'Responda APENAS com um JSON no formato {"chamadas":["...","...","..."]}.',
  ]
    .filter(Boolean)
    .join('\n');

  const resposta = await fetch(OPENROUTER_URL + '/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error('OpenRouter respondeu ' + resposta.status + ' ' + detalhe.slice(0, 160));
  }

  const json = await resposta.json();
  const conteudo: string = json?.choices?.[0]?.message?.content ?? '';

  let lista: unknown;
  try {
    lista = JSON.parse(conteudo)?.chamadas;
  } catch {
    throw new Error('resposta em formato inesperado');
  }

  const limpas = (Array.isArray(lista) ? lista : [])
    .filter((c: unknown): c is string => typeof c === 'string')
    .map((c: string) => c.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (limpas.length === 0) throw new Error('a IA não devolveu nenhuma chamada');
  return limpas;
}

// Reserva sem IA: texto de modelo com o nome e o ramo encaixados. Não é
// criativo, mas dá ao pastor um ponto de partida pra editar à mão.
function chamadasDeModelo(nome: string, ramo: string): string[] {
  return [
    `${nome}: qualidade e confiança em ${ramo}.`,
    `${nome} apoia a Rádio Graça & Paz. Fale com a gente!`,
    `${nome} — o melhor atendimento em ${ramo}.`,
  ];
}

// ---------------------------------------------------------------------------
// Imagem por IA: arte de fundo, SEM texto e SEM logo
// ---------------------------------------------------------------------------
// A logo real e o nome do anunciante entram por cima, no app, com fonte de
// verdade. Modelos de imagem deformam marca e erram letra — pedir pra IA
// escrever o nome produziria exatamente o tipo de peça que envergonha quem
// está pagando pelo anúncio.
async function gerarArteIA(
  chave: string,
  dados: { ramo: string; detalhes: string }
): Promise<Imagem> {
  const prompt = [
    'Fotografia de fundo para um card de anúncio de rádio.',
    'Tema: ' + dados.ramo + '.',
    dados.detalhes ? 'Contexto: ' + dados.detalhes + '.' : '',
    'Composição limpa e acolhedora, luz natural quente, tons terrosos e',
    'dourados suaves, profundidade de campo suave.',
    'O lado esquerdo da imagem deve ficar visualmente calmo e pouco',
    'detalhado, porque receberá um logotipo e um texto por cima.',
    'ABSOLUTAMENTE NENHUM texto, letra, número, palavra, placa, cartaz,',
    'logotipo ou marca na imagem.',
    'Sem pessoas com o rosto em destaque.',
  ]
    .filter(Boolean)
    .join(' ');

  const resposta = await fetch(OPENROUTER_URL + '/images', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, aspect_ratio: '16:9' }),
    signal: AbortSignal.timeout(40000),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error('OpenRouter respondeu ' + resposta.status + ' ' + detalhe.slice(0, 160));
  }

  const json = await resposta.json();
  const imagem = json?.data?.[0] ?? json?.images?.[0];
  const b64: string | undefined = imagem?.b64_json;

  if (!b64) throw new Error('a resposta não trouxe imagem');

  return {
    bytes: Uint8Array.from(Buffer.from(b64, 'base64')),
    tipo: imagem?.media_type || 'image/png',
  };
}

// ---------------------------------------------------------------------------
// Imagem de reserva: foto temática, baixada pra virar arquivo nosso
// ---------------------------------------------------------------------------
async function baixarFotoTematica(ramo: string): Promise<Imagem> {
  const normalizado = ramo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  let foto = FOTOS_POR_RAMO.default;
  for (const [chave, id] of Object.entries(FOTOS_POR_RAMO)) {
    if (chave !== 'default' && normalizado.includes(chave)) {
      foto = id;
      break;
    }
  }

  const url = `https://images.unsplash.com/${foto}?auto=format&fit=crop&w=1200&h=675&q=80`;
  const resposta = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (!resposta.ok) throw new Error('banco de imagens respondeu ' + resposta.status);

  const buffer = await resposta.arrayBuffer();
  if (buffer.byteLength < 1000) throw new Error('arquivo veio vazio');

  return { bytes: new Uint8Array(buffer), tipo: 'image/jpeg' };
}

// ---------------------------------------------------------------------------
// Storage: sempre grava arquivo e devolve CAMINHO, nunca URL
// ---------------------------------------------------------------------------
async function salvarNoStorage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  imagem: Imagem,
  nomeAnunciante: string
): Promise<string> {
  const extensao = imagem.tipo.includes('jpeg') ? 'jpg' : 'png';
  const slug =
    nomeAnunciante
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'anuncio';

  // Mesmo bucket das logos (já público), sob um prefixo próprio.
  const caminho = `arte-ia/${slug}-${Date.now()}.${extensao}`;

  const { error } = await supabase.storage
    .from('patrocinadores')
    .upload(caminho, imagem.bytes, { contentType: imagem.tipo, upsert: false });

  if (error) throw new Error(error.message);

  return caminho;
}
