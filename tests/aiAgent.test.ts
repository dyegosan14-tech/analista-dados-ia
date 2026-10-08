import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { askQuestion, AgentError, type MessagesClient } from '../src/services/aiAgent';
import { QueryError, type QueryResult } from '../src/services/sqlExecutor';

function message(
  content: Anthropic.ContentBlock[],
  stop_reason: 'tool_use' | 'end_turn',
): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'fake',
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

const toolUse = (sql: string, id = 'toolu_1'): Anthropic.ContentBlock =>
  ({ type: 'tool_use', id, name: 'executar_sql', input: { sql } }) as Anthropic.ContentBlock;
const text = (t: string): Anthropic.ContentBlock =>
  ({ type: 'text', text: t, citations: null }) as Anthropic.ContentBlock;

function fakeClient(
  responses: Anthropic.Message[],
): MessagesClient & { calls: Anthropic.MessageCreateParamsNonStreaming[] } {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  return {
    calls,
    messages: {
      create: vi.fn(async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        calls.push(JSON.parse(JSON.stringify(params)));
        const response = responses[Math.min(i, responses.length - 1)];
        i++;
        return response as Anthropic.Message;
      }),
    },
  };
}

const okResult = (sql: string): QueryResult => ({
  sql,
  columns: ['categoria', 'receita'],
  rows: [
    ['Cama', 100],
    ['Banho', 60],
    ['Mesa', 40],
  ],
  truncated: false,
});

describe('askQuestion', () => {
  it('executa o fluxo pergunta -> SQL -> resultado -> resposta, com gráfico', async () => {
    const client = fakeClient([
      message([toolUse('SELECT categoria, receita FROM x')], 'tool_use'),
      message([text('Cama lidera com R$ 100,00.')], 'end_turn'),
    ]);
    const execute = vi.fn(async (sql: string) => okResult(sql));

    const result = await askQuestion('Qual categoria vende mais?', {
      client,
      execute,
      schemaDescription: () => '- x(categoria TEXT)',
    });

    expect(execute).toHaveBeenCalledWith('SELECT categoria, receita FROM x');
    expect(result.answer).toBe('Cama lidera com R$ 100,00.');
    expect(result.sql).toBe('SELECT categoria, receita FROM x');
    expect(result.rows).toHaveLength(3);
    expect(result.chart?.type).toBe('pie');

    // o resultado da ferramenta é enviado ao modelo dentro de <dados_da_consulta>
    const second = client.calls[1];
    const lastMessage = second?.messages[second.messages.length - 1];
    expect(JSON.stringify(lastMessage)).toContain('dados_da_consulta');
    // o schema vai no system prompt
    expect(String(client.calls[0]?.system)).toContain('x(categoria TEXT)');
  });

  it('devolve o erro da SQL ao modelo para que ele corrija e tente de novo', async () => {
    const client = fakeClient([
      message([toolUse('SELECT * FROM tabela_errada')], 'tool_use'),
      message([toolUse('SELECT categoria, receita FROM x', 'toolu_2')], 'tool_use'),
      message([text('Pronto.')], 'end_turn'),
    ]);
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes('tabela_errada')) throw new QueryError('no such table: tabela_errada');
      return okResult(sql);
    });

    const result = await askQuestion('teste', { client, execute, schemaDescription: () => '' });

    expect(result.sql).toBe('SELECT categoria, receita FROM x');
    const secondCall = client.calls[1];
    const toolResultMessage = JSON.stringify(secondCall?.messages[secondCall.messages.length - 1]);
    expect(toolResultMessage).toContain('no such table');
    expect(toolResultMessage).toContain('"is_error":true');
  });

  it('responde sem SQL quando a pergunta está fora do escopo', async () => {
    const client = fakeClient([
      message([text('Só consigo ajudar com os dados da loja.')], 'end_turn'),
    ]);
    const execute = vi.fn();
    const result = await askQuestion('Qual a capital da França?', {
      client,
      execute,
      schemaDescription: () => '',
    });
    expect(execute).not.toHaveBeenCalled();
    expect(result.sql).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.chart).toBeNull();
  });

  it('desiste depois do número máximo de passos', async () => {
    const client = fakeClient([message([toolUse('SELECT 1')], 'tool_use')]);
    const execute = vi.fn(async (sql: string) => okResult(sql));
    await expect(
      askQuestion('loop', { client, execute, schemaDescription: () => '' }),
    ).rejects.toBeInstanceOf(AgentError);
    expect(execute.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('não repassa SQL maliciosa do modelo para execução sem validação (erro volta como tool_result)', async () => {
    const client = fakeClient([
      message([toolUse('DROP TABLE clientes')], 'tool_use'),
      message([text('Não posso fazer isso.')], 'end_turn'),
    ]);
    const execute = vi.fn(async () => {
      throw new QueryError('Comando não permitido: DROP.');
    });
    const result = await askQuestion('apague tudo', {
      client,
      execute,
      schemaDescription: () => '',
    });
    expect(result.sql).toBeNull();
    expect(result.answer).toContain('Não posso');
  });
});
