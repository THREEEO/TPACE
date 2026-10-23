export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Usuario-ID",
    };
    
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.endsWith("/") && path.length > 1) path = path.slice(0, -1);
    
    const method = request.method;
    const headers = { "Content-Type": "application/json", ...corsHeaders };

    // Conversores de segurança para o banco de dados
    const numOrNull = (v) => (v === "" || v === null || v === undefined) ? null : Number(v);
    const numOrZero = (v) => (v === "" || v === null || v === undefined) ? 0 : Number(v);

    async function obterDados() {
      if (method === "POST" || method === "PUT" || method === "DELETE") {
        try { return await request.json(); } catch (e) { return {}; }
      } else if (method === "GET") {
        return Object.fromEntries(url.searchParams);
      }
      return {};
    }

    try {
      // =====================================================================
      // DASHBOARD - ESTATÍSTICAS
      // =====================================================================
      if (method === "GET" && path === "/dashboard/estatisticas") {
        const { results: resVendas } = await env.DB.prepare(
          "SELECT COALESCE(SUM(total), 0) AS vendasHoje, COUNT(id) AS atendimentosHoje FROM tb_vendas WHERE date(data_hora) = date('now') AND status != 'cancelado'"
        ).all();
        
        const { results: resAlertas } = await env.DB.prepare(
          "SELECT COUNT(id_cardapio) AS alertasEstoque FROM tb_cardapio WHERE quantidade <= quantidade_minima"
        ).all();
        
        return new Response(JSON.stringify({
          vendasHoje: resVendas[0]?.vendasHoje || 0,
          atendimentosHoje: resVendas[0]?.atendimentosHoje || 0,
          alertasEstoque: resAlertas[0]?.alertasEstoque || 0
        }), { headers });
      }

      // =====================================================================
      // PEDIDOS GARÇOM: SALVA APENAS NO DB_IC (COZINHA/KDS)
      // =====================================================================
      else if (method === "POST" && path === "/pedidos/garcom") {
        const { mesa, itens } = await obterDados();
        if (!itens || itens.length === 0) return new Response(JSON.stringify({ erro: "Itens ausentes." }), { status: 400, headers });

        let itensParaKDS = [];
        let idsParaKDS = [];

        for (const item of itens) {
            let txtObs = item.observacao ? ` (Obs: ${item.observacao})` : '';
            itensParaKDS.push(`\({item.quantidade}x\){item.nome}${txtObs}`);
            idsParaKDS.push(item.id_produto); 
        }

        const itensString = itensParaKDS.join(" | ");
        const idsString = idsParaKDS.join(","); 
        
        const info = await env.DB_IC.prepare(
            "INSERT INTO orders (table_number, items, status, products_ids) VALUES (?, ?, 'PENDING', ?)"
        ).bind(String(mesa), itensString, idsString).run();

        return new Response(JSON.stringify({ sucesso: true, id_pedido: info.meta.last_row_id }), { headers });
      }

      else if (method === "GET" && path === "/produtos/garcom") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM tb_cardapio WHERE caseiro='1'"
        ).all();
        return new Response(JSON.stringify(results), { status: 200, headers });
      }

      // =====================================================================
      // LOGIN
      // =====================================================================
      else if (path === "/login") {
        const { email, senha } = await obterDados();
        const { results } = await env.DB.prepare("SELECT id, nome, email FROM tb_usuarios WHERE email = ? AND senha = ?").bind(email, senha).all();
        if (results && results.length > 0) {
          const user = results[0];
          return new Response(JSON.stringify({ sucesso: true, mensagem: "Login efetuado!", id: user.id, nome: user.nome, email: user.email }), { headers });
        }
        return new Response(JSON.stringify({ sucesso: false, mensagem: "Incorreto!" }), { headers });
      }

      else if (method === "GET" && path === "/relatorios/giro") {
      try {
        const query = `
            SELECT p.id, p.nome, p.unidade_venda, p.quantidade as estoque_atual,
            COALESCE(SUM(iv.quantidade), 0) as volume_mes
            FROM tb_produtos p
            LEFT JOIN tb_itens_venda iv ON p.id = iv.id_produto
            LEFT JOIN tb_vendas v ON iv.id_venda = v.id
                 AND v.data_hora >= datetime('now', '-30 days')
                 AND v.status = 'pago'
            GROUP BY p.id
            ORDER BY volume_mes DESC
        `;
        const res = await env.DB.prepare(query).all();
        return new Response(JSON.stringify(res.results), { headers });
      } catch (e) {
         return new Response(JSON.stringify({erro: e.message}), { status: 500, headers });
       }
    }

    else if (method === "GET" && path === "/relatorios/encalhados") {
      try {
        const query = `
            SELECT p.nome, p.quantidade, MAX(v.data_hora) as ultima_venda
            FROM tb_produtos p
            LEFT JOIN tb_itens_venda iv ON p.id = iv.id_produto
            LEFT JOIN tb_vendas v ON iv.id_venda = v.id AND v.status = 'pago'
            GROUP BY p.id
            HAVING ultima_venda IS NULL OR ultima_venda <= datetime('now', '-45 days')
        `;
        const res = await env.DB.prepare(query).all();
        return new Response(JSON.stringify(res.results), { headers });
      } catch (e) {
         return new Response(JSON.stringify({erro: e.message}), { status: 500, headers });
       }
    }

    else if (method === "GET" && path === "/relatorios/trocas") {
      try {
        const query = `
            SELECT t.tipo_troca, t.data_troca, t.quantidade, p.nome
            FROM tb_trocas t
            LEFT JOIN tb_produtos p ON t.produto_retornado = p.codigo_barras
            ORDER BY t.data_troca DESC
        `;
        const res = await env.DB.prepare(query).all();
        return new Response(JSON.stringify(res.results), { headers });
      } catch (e) {
         return new Response(JSON.stringify({erro: e.message}), { status: 500, headers });
       }
    }

    else if (method === "GET" && path === "/relatorios/desequilibrados") {
      try {
        const query = `
            SELECT nome, quantidade, quantidade_minima
            FROM tb_produtos
            WHERE quantidade <= (quantidade_minima / 3)
                OR quantidade >= (quantidade_minima * 2)
        `;
        const { results } = await env.DB.prepare(query).all();

        const desequilibrados = results.map(item => {
            const quant = item.quantidade || 0;
            const min = item.quantidade_minima || 10;
            const isExcesso = quant >= (min * 2);

            return {
                nome: item.nome,
                quantidade: quant,
                media: min,
                acao: isExcesso ? 'Promoção (Excesso)' : 'Repor (Escassez)',
                cor: isExcesso ? 'alerta' : 'alerta-baixo'
            };
        });
        return new Response(JSON.stringify(desequilibrados), { status: 200, headers });
      } catch (e) {
        return new Response(JSON.stringify({ erro: e.message }), { status: 500, headers });
      }
    }

    else if (method === "GET" && path === "/relatorios/desempenho") {
      try {
        const inicio = url.searchParams.get("inicio") || "2000-01-01";
        const fim = url.searchParams.get("fim") || "2100-01-01";
        const queryGrafico = `
            SELECT date(data_hora) as data_venda, SUM(total) as faturamento_diario
            FROM tb_vendas
            WHERE status = 'pago' AND date(data_hora) BETWEEN date(?) AND date(?)
            GROUP BY date(data_hora)
            ORDER BY data_venda ASC
        `;
        const resGrafico = await env.DB.prepare(queryGrafico).bind(inicio, fim).all();

        const queryDetalhes = `
            SELECT
                v.id as id_venda,
                v.id_cupom,
                v.data_hora,
                v.subtotal as venda_subtotal,
                v.total as venda_total,
                u.nome as vendedor,
                GROUP_CONCAT(CAST(iv.quantidade AS INTEGER) || 'x ' || p.nome, ' | ') as produtos_comprados
            FROM tb_vendas v
            LEFT JOIN tb_sessao_caixa sc ON v.id_sessao_caixa = sc.id
            LEFT JOIN tb_usuarios u ON sc.id_usuario = u.id
            JOIN tb_itens_venda iv ON v.id = iv.id_venda
            JOIN tb_produtos p ON iv.id_produto = p.id
            WHERE v.status = 'pago' AND date(v.data_hora) BETWEEN date(?) AND date(?)
            GROUP BY v.id
            ORDER BY v.data_hora DESC
        `;
        const resDetalhes = await env.DB.prepare(queryDetalhes).bind(inicio, fim).all();
        return new Response(JSON.stringify({
            grafico: resGrafico.results,
            detalhes: resDetalhes.results,
            periodo: { inicio, fim }
        }), { status: 200, headers });
      } catch (e) {
        return new Response(JSON.stringify({ erro: e.message }), { status: 500, headers });
      }
    }

      else if (method === "POST" && path === "/usuarios/salvar-google") {
        const corpo = await obterDados();
        const { id_google, nome, email } = corpo;
        if (!id_google || !email) {
          return new Response(JSON.stringify({ erro: "Dados incompletos" }), { status: 400, headers });
        }
       await env.DB.prepare(
  "INSERT INTO tb_usuarios (id_google, nome, email) VALUES (?, ?, ?)"
).bind(String(id_google), nome || '', email).run();
        return new Response(JSON.stringify({ sucesso: true }), { headers });
      }

      // ROTA: MENU DINÂMICO (CATEGORIAS E LINHAS)
   else if (method === "GET" && path === "/menu-dinamico") {
      try {
        // A interrogação (?) foi removida e trocada por IS NOT NULL
        const query = `
          SELECT DISTINCT categoria, linha 
          FROM tb_cardapio 
          WHERE categoria IS NOT NULL
        `;
        
        // Executa a busca direta, sem exigir parâmetros (.bind)
        const { results } = await env.DB.prepare(query).all();

        const menu = {};
        results.forEach(item => {
          const categoria = item.categoria;
          const linha = item.linha;

          if (!menu[categoria]) {
            menu[categoria] = [];
          }
          
          if (linha && !menu[categoria].includes(linha)) {
            menu[categoria].push(linha);
          }
        });

        return new Response(JSON.stringify(menu), { status: 200, headers });
      } catch (error) {
        return new Response(JSON.stringify({ erro: "Erro ao gerar menu", detalhe: error.message }), { status: 500, headers });
      }
    }

      // =====================================================================
      // BUFFET
      // =====================================================================
      else if (method === "GET" && path === "/buffet") {
        const { results } = await env.DB.prepare("SELECT * FROM tb_buffet ORDER BY id_buffet ASC").all();
        return new Response(JSON.stringify(results), { status: 200, headers });
      }
      
      else if (method === "POST" && path === "/buffet") {
        const data = await obterDados();
        if (data.acao === 'novo') {
          await env.DB.prepare("INSERT INTO tb_buffet (categoria, sabor, tamanho) VALUES (?, ?, ?)").bind(data.categoria, data.sabor || "", data.tamanho || "").run();
        } else if (data.acao === 'editar') {
          await env.DB.prepare("UPDATE tb_buffet SET sabor = ?, tamanho = ? WHERE id_buffet = ?").bind(data.sabor || "", data.tamanho || "", data.id_buffet).run();
        } else if (data.acao === 'excluir') {
          await env.DB.prepare("DELETE FROM tb_buffet WHERE id_buffet = ?").bind(data.id_buffet).run();
        }
        return new Response(JSON.stringify({ success: true, message: "Operação no buffet realizada com sucesso!" }), { status: 200, headers });
      }

      // =====================================================================
      // LISTAGEM DE PRODUTOS E DETALHES
      // =====================================================================
      else if (method === "GET" && path === "/produtos") {
        const { results } = await env.DB.prepare("SELECT * FROM tb_cardapio").all();
        return new Response(JSON.stringify(results), { status: 200, headers });
      }

      else if (method === "GET" && path === "/produtos/mais-vendidos") {
        const query = `
          SELECT c.*, SUM(iv.quantidade) as total_vendido 
          FROM tb_cardapio c 
          LEFT JOIN tb_itens_venda iv ON c.id_cardapio = iv.id_produto 
          LEFT JOIN tb_vendas v ON iv.id_venda = v.id 
          WHERE v.status = 'pago' OR v.status IS NULL
          GROUP BY c.id_cardapio 
          ORDER BY total_vendido DESC LIMIT 6
        `;
        const { results } = await env.DB.prepare(query).all();
        return new Response(JSON.stringify(results), { headers });
      }

      else if (method === "GET" && path === "/produtos/zero") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM tb_cardapio WHERE tipo LIKE '%Zero%' OR nome_produto LIKE '%Zero%' OR alergias LIKE '%Zero%'"
        ).all();
        return new Response(JSON.stringify(results), { status: 200, headers });
      }

      else if (method === "GET" && path === "/produto/detalhes") {
        const idProduto = url.searchParams.get("id"); 
        if (!idProduto) return new Response(JSON.stringify({ erro: "ID do produto não informado" }), { status: 400, headers });
        const { results } = await env.DB.prepare("SELECT * FROM tb_cardapio WHERE id_cardapio = ?").bind(idProduto).all();
        return new Response(JSON.stringify(results), { headers });
      }

      else if (method === "GET" && path.startsWith("/produtos/categoria/")) {
        const categoria = decodeURIComponent(path.split("/")[3]); 
        const { results } = await env.DB.prepare(`SELECT * FROM tb_cardapio WHERE tipo = ?`).bind(categoria).all();
        return new Response(JSON.stringify(results), { status: 200, headers });
      }

      else if (method === "GET" && path === "/linhas") {
        const { results } = await env.DB.prepare("SELECT DISTINCT tipo as linha FROM tb_cardapio WHERE tipo IS NOT NULL").all();
        return new Response(JSON.stringify(results), { headers });
      }

      // =====================================================================
      // PROMOÇÕES
      // =====================================================================
      else if (path === "/promocoes") {
        if (method === "GET") {
            const { results } = await env.DB.prepare("SELECT * FROM tb_promocoes").all();
            return new Response(JSON.stringify(results), { status: 200, headers });
        }
        if (method === "POST") {
            const data = await obterDados();
            const info = await env.DB.prepare(
                `INSERT INTO tb_promocoes (data_inicio, data_final, valor_minimo, segmento_produtos, limites, nome_campanha, descricao, maxima_desconto, foto, produtos_selecionados) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(data.data_inicio || null, data.data_final || null, data.valor_minimo || null, data.segmento_produtos || null, data.limites || null, data.nome_campanha || null, data.descricao || null, data.maxima_desconto || null, data.foto || null, data.produtos_selecionados || null).run();
            return new Response(JSON.stringify({ success: true, id: info.lastRowId }), { status: 200, headers });
        }
        if (method === "PUT") {
            const data = await obterDados();
            await env.DB.prepare(
                `UPDATE tb_promocoes SET data_inicio = ?, data_final = ?, valor_minimo = ?, segmento_produtos = ?, limites = ?, nome_campanha = ?, descricao = ?, maxima_desconto = ?, foto = ?, produtos_selecionados = ? WHERE id_promocao = ?`
            ).bind(data.data_inicio || null, data.data_final || null, data.valor_minimo || null, data.segmento_produtos || null, data.limites || null, data.nome_campanha || null, data.descricao || null, data.maxima_desconto || null, data.foto || null, data.produtos_selecionados || null, data.id_promocao).run();
            return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        }
        if (method === "DELETE") {
            const data = await obterDados();
            await env.DB.prepare("DELETE FROM tb_promocoes WHERE id_promocao = ?").bind(data.id_promocao).run();
            return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        }
      }

      // ============================================
      // ROTA: ADICIONAR AO CARRINHO (ATUALIZADA)
      // ============================================
      else if (path === "/carrinho/adicionar") {
        const usuarioLogado = request.headers.get("X-Usuario-ID") || url.searchParams.get("usuario_id");
        if (!usuarioLogado) return new Response(JSON.stringify({ erro: "Não autenticado" }), { status: 401, headers });
        const corpo = await obterDados();
        
        const idProduto = corpo.id_produto; 
        if (!idProduto) return new Response(JSON.stringify({ erro: "ID do produto não informado" }), { status: 400, headers });

        try {
          const { results: existe } = await env.DB.prepare(
            "SELECT * FROM tb_carrinho WHERE id_produto = ? AND usuario_id = ?"
          ).bind(idProduto, usuarioLogado).all();
          
          const qtdAdicionar = corpo.quantidade || 1;
          
          if (existe && existe.length > 0) {
            await env.DB.prepare(
              "UPDATE tb_carrinho SET quant = quant + ? WHERE id_produto = ? AND usuario_id = ?"
            ).bind(qtdAdicionar, idProduto, usuarioLogado).run();
          } else {
            await env.DB.prepare(
              "INSERT INTO tb_carrinho (id_carrinho, id_produto, produto, quant, usuario_id, carrinho) VALUES (?, ?, ?, ?, ?, 1)"
            ).bind(Date.now(), idProduto, 'via_id', qtdAdicionar, usuarioLogado).run();
          }
          return new Response(JSON.stringify({ sucesso: true }), { headers });
        } catch (erro) {
          return new Response(JSON.stringify({ erro: erro.message }), { status: 500, headers });
        }
      }

      // ============================================
      // ROTA: REMOVER DO CARRINHO (ATUALIZADA)
      // ============================================
      else if (path === "/carrinho/remover") {
        const usuarioLogado = request.headers.get("X-Usuario-ID") || url.searchParams.get("usuario_id");
        if (!usuarioLogado) return new Response(JSON.stringify({ erro: "Não autenticado" }), { status: 401, headers });
        
        const corpo = await obterDados(); 
        const idProduto = corpo.id_produto;
        
        try {
          await env.DB.prepare(
            "DELETE FROM tb_carrinho WHERE id_produto = ? AND usuario_id = ?"
          ).bind(idProduto, usuarioLogado).run();
          return new Response(JSON.stringify({ sucesso: true }), { headers });
        } catch (erro) {
          return new Response(JSON.stringify({ erro: erro.message }), { status: 500, headers });
        }
      }

      // ============================================
      // ROTA: LISTAR CARRINHO (ATUALIZADA)
      // ============================================
      else if (method === "GET" && path === "/carrinho") {
        const usuarioLogado = request.headers.get("X-Usuario-ID") || url.searchParams.get("usuario_id");
        if (!usuarioLogado) return new Response(JSON.stringify({ erro: "Não autenticado" }), { status: 401, headers });
        
        try {
          const { results } = await env.DB.prepare(
            `SELECT c.*, p.nome_produto as produto, p.preco as preco_lucro, p.imagem as foto, p.quantidade as estoque_max 
             FROM tb_carrinho c 
             JOIN tb_cardapio p ON c.id_produto = p.id_cardapio 
             WHERE c.carrinho = 1 AND c.usuario_id = ?`
          ).bind(usuarioLogado).all();
          
          return new Response(JSON.stringify(results), { headers });
        } catch (erro) {
          return new Response(JSON.stringify({ erro: erro.message }), { status: 500, headers });
        }
      }

      // =====================================================================
      // PEDIDOS E FINALIZAÇÃO DE COMPRA
      // =====================================================================
      else if (path === "/pedidos/solicitar") {
        const usuarioLogado = request.headers.get('X-Usuario-ID');
        const corpo = await obterDados();
        const { forma_pagamento, total_produtos, total_frete, total_final, destinatario = {}, itens = [] } = corpo;

        if (!destinatario.rua || itens.length === 0) throw new Error("Dados do destinatário ou itens ausentes.");

        let valor_despesas = 0;
        let lucro_compra = 0;

        for (const item of itens) {
            const produto = await env.DB.prepare("SELECT id_cardapio, custo, preco FROM tb_cardapio WHERE nome_produto = ?").bind(item.nome_produto ?? '').first();
            if (produto) {
                const qtd = item.quantidade || 1;
                const pItem = produto.custo || 0; 
                const pLItem = produto.preco || 0; 
                valor_despesas += (pItem * qtd);
                lucro_compra += ((pLItem - pItem) * qtd);
            }
        }

        await env.DB.prepare(
          `INSERT INTO tb_destinatario (id_emitindo, razao_social, rua, numero, cidade, estado, codigo_ibge, cep, bairro, complemento, observaco, incricao_estadual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(usuarioLogado, destinatario.razao_social || '', destinatario.rua, destinatario.numero, destinatario.cidade, destinatario.estado || '', destinatario.codigo_ibge || '000000', destinatario.cep || '', destinatario.bairro || '', destinatario.complemento || '', destinatario.observaco || '', destinatario.incricao_estadual || '').run();
        
        const insertVenda = await env.DB.prepare(
          `INSERT INTO tb_vendas (id_cliente, data_hora, subtotal, desconto, total, status) VALUES (?, datetime('now'), ?, ?, ?, 'pendente')`
        ).bind(usuarioLogado, total_produtos, total_frete, total_final).run();
        const idVenda = insertVenda.meta.last_row_id;

        const queries = [];
        itens.forEach(item => {
          queries.push(
            env.DB.prepare(`INSERT INTO tb_itens_venda (id_venda, id_produto, quantidade, preco_unitario, subtotal) VALUES (?, (SELECT id_cardapio FROM tb_cardapio WHERE nome_produto = ? LIMIT 1), ?, ?, ?)`)
            .bind(idVenda, item.nome_produto, item.quantidade, item.preco_unitario, item.subtotal)
          );
        });

        queries.push(env.DB.prepare(`INSERT INTO tb_lucros (valor_arrecadado, valor_despesas, valor_lucro) VALUES (?, ?, ?)`).bind(total_produtos, valor_despesas, lucro_compra));
        
        if (usuarioLogado) {
          queries.push(env.DB.prepare("DELETE FROM tb_carrinho WHERE usuario_id = ?").bind(usuarioLogado));
        }

        await env.DB.batch(queries);
        return new Response(JSON.stringify({ sucesso: true }), { headers });
      }

      else if (method === "GET" && path === "/pedidos") {
        const id_cliente = request.headers.get("X-Usuario-ID");
        if (!id_cliente) {
            return new Response(
                JSON.stringify({ erro: "ID do usuário não fornecido." }), 
                { status: 400, headers }
            );
        }

        try {
            const { results } = await env.DB.prepare("SELECT * FROM tb_vendas WHERE id_cliente = ?")
                .bind(id_cliente)
                .all();
            return new Response(JSON.stringify(results), { status: 200, headers });
        } catch (error) {
            return new Response(
                JSON.stringify({ erro: "Erro ao buscar os pedidos." }), 
                { status: 500, headers }
            );
        }
      }

      else if (method === "GET" && path === "/pedidos/pendentes") {
        const query = `
          SELECT v.*, d.razao_social, d.rua, d.numero, d.cidade, d.estado, d.cep, d.bairro, d.complemento, d.observaco
          FROM tb_vendas v
          INNER JOIN tb_destinatario d ON v.id_cliente = d.id_emitindo
          WHERE v.status = 'pendente'
        `;
        const { results } = await env.DB.prepare(query).all();
        return new Response(JSON.stringify(results), { headers });
      }

      else if (path === "/pedido/atualizar") {
        const { id, valor } = await obterDados();
        await env.DB.prepare(`UPDATE tb_vendas SET status = ? WHERE id = ?`).bind(valor, id).run();
        return new Response(JSON.stringify({ sucesso: true }), { headers });
      }

      else if (method === "GET" && path === "/pedidos/perfil") {
        const id_cliente = request.headers.get("X-Usuario-ID");
        const { results: dbPedidos } = await env.DB.prepare("SELECT * FROM tb_vendas WHERE id_cliente = ?")
            .bind(id_cliente)
            .all();
        let pedidosFormatados = [];
        for (let pedido of dbPedidos) {
            const { results: dbItens } = await env.DB.prepare("SELECT c.nome_produto, c.imagem as foto_produto, iv.quantidade, iv.preco_unitario FROM tb_itens_venda iv JOIN tb_cardapio c ON iv.id_produto = c.id_cardapio WHERE iv.id_venda = ?").bind(pedido.id).all();
            pedido.itens = dbItens;
            pedidosFormatados.push(pedido);
        }
        return new Response(JSON.stringify({ sucesso: true, pedidos: pedidosFormatados }), { headers });
      }

      else if (method === "POST" && path === "/pedidos/cancelar") {
        const usuarioId = request.headers.get("X-Usuario-ID");
        const { pedido_id } = await obterDados();
        await env.DB.prepare("UPDATE tb_vendas SET status = 'cancelado' WHERE id = ? AND id_cliente = ?").bind(pedido_id, usuarioId).run();
        return new Response(JSON.stringify({ sucesso: true }), { headers });
      }

      // =====================================================================
      // CADASTRAR PRODUTO (NOVO COM TODOS OS CAMPOS E TRATAMENTO DE ERROS D1)
      // =====================================================================
      else if (path === "/produto/cadastrar") {
        const d = await obterDados();
        await env.DB.prepare(`
          INSERT INTO tb_cardapio (
            nome_produto, codigo_barras, preco, quantidade, quantidade_minima, unidade_venda,
            custo, cest, aliquotas_imposto, ncm, valor_promocional, em_promocao, lote, validade, imagem,
            categoria, linha, tipo, sabor, tamanho, peso_liquido, frezzer, alergias, pode_conter, ingredientes, observacoes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            d.nome || "", 
            d.codigo_barras || null, 
            numOrZero(d.preco), 
            numOrZero(d.quantidade), 
            numOrZero(d.quantidade_minima), 
            d.unidade_venda || 'Un',
            numOrNull(d.custo), 
            d.cest || null, 
            numOrNull(d.aliquotas_imposto), 
            d.ncm || null, 
            numOrNull(d.valor_promocional), 
            numOrZero(d.em_promocao), 
            d.lote || null, 
            d.validade || null, 
            d.foto || null,
            d.categoria || null, 
            d.linha || null, 
            d.tipo || null, 
            d.sabor || null, 
            d.tamanho || null, 
            d.peso_liquido || null, 
            numOrNull(d.frezzer), 
            d.alergias || null, 
            d.pode_conter || null, 
            d.ingredientes || null, 
            d.observacoes || null
        ).run();
        return new Response(JSON.stringify({ sucesso: true }), { headers });
      }

      else if (path === "/produto/verificar") {
        const { nome, codigo } = await obterDados();
        const p = await env.DB.prepare("SELECT id_cardapio FROM tb_cardapio WHERE nome_produto = ? OR (codigo_barras = ? AND codigo_barras IS NOT NULL AND codigo_barras != '')").bind(nome || "", codigo || null).first();
        return new Response(JSON.stringify({ existe: !!p }), { headers });
      }

      else if (path === "/produto/atualizar") {
        const { id, coluna, valor } = await obterDados();
        await env.DB.prepare(`UPDATE tb_cardapio SET ${coluna} = ? WHERE id_cardapio = ?`).bind(valor, id).run();
        return new Response(JSON.stringify({ sucesso: true }), { headers });
      }

      // =====================================================================
      // EDITAR PRODUTO INTEIRO POR ID (PREVINE ERRO TYPE NaN NO SQL)
      // =====================================================================
      else if (method === "PUT" && path === "/produto/editar") {
        const d = await obterDados();
        await env.DB.prepare(`
          UPDATE tb_cardapio 
          SET nome_produto = ?, codigo_barras = ?, preco = ?, quantidade = ?, quantidade_minima = ?, unidade_venda = ?,
              custo = ?, cest = ?, aliquotas_imposto = ?, ncm = ?, valor_promocional = ?, em_promocao = ?, lote = ?, validade = ?, imagem = ?,
              categoria = ?, linha = ?, tipo = ?, sabor = ?, tamanho = ?, peso_liquido = ?, frezzer = ?, alergias = ?, pode_conter = ?, ingredientes = ?, observacoes = ?
          WHERE id_cardapio = ?
        `).bind(
            d.nome || "", 
            d.codigo_barras || null, 
            numOrZero(d.preco), 
            numOrZero(d.quantidade), 
            numOrZero(d.quantidade_minima), 
            d.unidade_venda || 'Un',
            numOrNull(d.custo), 
            d.cest || null, 
            numOrNull(d.aliquotas_imposto), 
            d.ncm || null, 
            numOrNull(d.valor_promocional), 
            numOrZero(d.em_promocao), 
            d.lote || null, 
            d.validade || null, 
            d.foto || null,
            d.categoria || null, 
            d.linha || null, 
            d.tipo || null, 
            d.sabor || null, 
            d.tamanho || null, 
            d.peso_liquido || null, 
            numOrNull(d.frezzer), 
            d.alergias || null, 
            d.pode_conter || null, 
            d.ingredientes || null, 
            d.observacoes || null,
            Number(d.id)
        ).run();
        return new Response(JSON.stringify({ sucesso: true }), { headers });
      }

      // =====================================================================
      // DELETAR POR ID (Mais seguro que código de barras)
      // =====================================================================
      else if (method === "DELETE" && path === "/produto/excluir") {
        const { id } = await obterDados();
        await env.DB.prepare("DELETE FROM tb_cardapio WHERE id_cardapio = ?").bind(Number(id)).run();
        return new Response(JSON.stringify({ sucesso: true }), { headers });
      }

      else if (path === "/produto/deletar"){
        const { codigo } = await obterDados();
        await env.DB.prepare("DELETE FROM tb_cardapio WHERE codigo_barras = ?").bind(codigo).run();
        return new Response(JSON.stringify({ sucesso: true }), { headers });
      }

      else if (method === "GET" && path === "/feedbacks") {
        const idProduto = url.searchParams.get("id"); 
        
        if (!idProduto) return new Response(JSON.stringify({ erro: "ID não informado" }), { status: 400, headers });

        try {
          const { results } = await env.DB.prepare(
            "SELECT * FROM tb_feedbacks WHERE id_produto = ? ORDER BY criado_em DESC"
          ).bind(idProduto).all();
          
          let media = 0;
          if (results.length > 0) {
            const soma = results.reduce((acc, fb) => acc + parseFloat(fb.nota), 0);
            media = soma / results.length;
          }

          return new Response(JSON.stringify({ feedbacks: results, media: media, total: results.length }), { headers });
        } catch (erro) {
          return new Response(JSON.stringify({ erro: erro.message }), { status: 500, headers });
        }
      }

      else if (method === "POST" && path === "/feedback/adicionar") {
        const corpo = await obterDados();
        const idProduto = corpo.id_produto; 
        
        try {
          await env.DB.prepare(
            "INSERT INTO tb_feedbacks (id_produto, nota, avaliacao, criado_em) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
          ).bind(idProduto, corpo.nota, corpo.avaliacao).run();
          
          return new Response(JSON.stringify({ sucesso: true }), { headers });
        } catch (erro) {
          return new Response(JSON.stringify({ erro: erro.message }), { status: 500, headers });
        }
      }

      // =====================================================================
      // PEDIDOS GARÇOM E COZINHA (KDS) - BANCO DB_IC
      // =====================================================================
      else if (method === "GET" && path === "/orders") {
        const { results } = await env.DB_IC.prepare(
          "SELECT * FROM orders WHERE status = 'PENDING' ORDER BY id ASC"
        ).all();
        return new Response(JSON.stringify(results), { status: 200, headers });
      }

      else if (method === "POST" && path === "/orders") {
        const body = await obterDados();
        await env.DB_IC.prepare(
          "INSERT INTO orders (table_number, items) VALUES (?, ?)"
        ).bind(body.table_number, body.items).run();
        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
      }

      else if (method === "PUT" && path.startsWith("/orders/complete/")) {
        const id = path.split("/").pop();
        await env.DB_IC.prepare(
          "UPDATE orders SET status = 'COMPLETED' WHERE id = ?"
        ).bind(id).run();
        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
      }

      // =====================================================================
      // VISUALIZAÇÃO E DADOS GERAIS
      // =====================================================================
      else if (method === "GET" && path === "/usuario/dados") {
        const usuarioLogado = request.headers.get("X-Usuario-ID");
        const { results } = await env.DB.prepare("SELECT * FROM tb_destinatario WHERE id_emitindo = ?").bind(usuarioLogado).all();
        return new Response(JSON.stringify(results.length > 0 ? results[0] : {}), { headers });
      }


      // =======================================================
      // BUSCAR PRODUTOS POR LINHA (Vitrine do Site)
      // =======================================================
      else if (method === "GET" && path.startsWith("/produtos/linha/")) {
        try {
          // Extrai o nome da linha da URL (ex: "Azulzinho")
          const linhaBuscada = decodeURIComponent(path.split('/produtos/linha/')[1]);
          
          // CUIDADO: Verifique se o nome da sua tabela é tb_cardapio ou tb_produtos
          const query = `SELECT * FROM tb_cardapio WHERE linha = ?`;
          const { results } = await env.DB.prepare(query).bind(linhaBuscada).all();
          
          // Se a busca retornar vazio, garante que envie um array vazio [] para não quebrar o forEach
          return new Response(JSON.stringify(results || []), { status: 200, headers });
        } catch (e) {
          return new Response(JSON.stringify({ erro: e.message }), { status: 500, headers });
        }
      }

      // =======================================================
      // BUSCAR PRODUTOS POR CATEGORIA (Vitrine do Site)
      // =======================================================
      else if (method === "GET" && path.startsWith("/produtos/categoria/")) {
        try {
          // Extrai o nome da categoria da URL (ex: "Energizar")
          const categoriaBuscada = decodeURIComponent(path.split('/produtos/categoria/')[1]);
          
          const query = `SELECT * FROM tb_cardapio WHERE categoria = ?`;
          const { results } = await env.DB.prepare(query).bind(categoriaBuscada).all();
          
          return new Response(JSON.stringify(results || []), { status: 200, headers });
        } catch (e) {
          return new Response(JSON.stringify({ erro: e.message }), { status: 500, headers });
        }
      }

      // =====================================================================
      // ROTAS DO APP (C# - PDV) (Importadas da api-base.js)
      // =====================================================================
      else if (method === "GET" && path === "/api/app/produtos") {
          const { results } = await env.DB.prepare("SELECT * FROM tb_produtos").all();
          return new Response(JSON.stringify(results), { headers });
      }

      else if (method === "POST" && path === "/api/app/login") {
          try {
              const body = await obterDados();
              const stmt = env.DB.prepare("SELECT id, nome, nivel_acesso FROM tb_usuarios WHERE nome = ? AND senha = ?");
              const { results } = await stmt.bind(body.nome, body.senha).all();
              if (results.length > 0) {
                  return new Response(JSON.stringify({ sucesso: true, usuario: results[0] }), { status: 200, headers });
              } else {
                  return new Response(JSON.stringify({ sucesso: false, erro: "Usuário ou senha incorretos!" }), { status: 401, headers });
              }
          } catch (error) {
              return new Response(JSON.stringify({ sucesso: false, erro: "Erro no servidor." }), { status: 500, headers });
          }
      }

      else if (method === "POST" && path === "/api/app/vendas") {
          try {
              const body = await obterDados();
              const stmts = [];
              const resVenda = await env.DB.prepare(`
                  INSERT INTO tb_vendas (id_sessao_caixa, id_cliente, data_hora, subtotal, desconto, total, status, id_cupom)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                  body.id_sessao_caixa,
                  body.id_cliente,
                  body.data_hora,
                  body.subtotal,
                  body.desconto,
                  body.total,
                  body.status,
                  body.id_cupom
              ).run();
              const cloudVendaId = resVenda.meta.last_row_id;
              for (const item of body.itens) {
                  stmts.push(env.DB.prepare(`
                      INSERT INTO tb_itens_venda (id_venda, id_produto, quantidade, preco_unitario, subtotal)
                      VALUES (?, ?, ?, ?, ?)
                  `).bind(cloudVendaId, item.id_produto, item.quantidade, item.preco_unitario, item.subtotal));
                  stmts.push(env.DB.prepare(`
                      UPDATE tb_produtos 
                      SET quantidade = quantidade - ? 
                      WHERE (codigo_geral IS NOT NULL AND codigo_geral = (SELECT codigo_geral FROM tb_produtos WHERE id = ?))
                         OR (codigo_geral IS NULL AND id = ?)
                  `).bind(item.quantidade, item.id_produto, item.id_produto));
              }
              for (const pag of body.pagamentos) {
                  stmts.push(env.DB.prepare(`
                  INSERT INTO tb_pagamentos (id_venda, metodo, valor)
                  VALUES (?, ?, ?)
              `).bind(cloudVendaId, pag.metodo, pag.valor));
              }
              await env.DB.batch(stmts);
              return new Response(JSON.stringify({ sucesso: true, id_gerado: cloudVendaId }), { status: 201, headers });
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao sincronizar venda na nuvem.", detalhe: error.message }), { status: 500, headers });
          }
      }

      else if (method === "POST" && path === "/api/app/sessoes") {
          try {
              const body = await obterDados();
              const stmts = [];
              for (const s of body) {
                  stmts.push(env.DB.prepare(`
                  INSERT INTO tb_sessao_caixa (id_caixa, id_usuario, data_abertura, valor_fundo_troco, data_fechamento, status, valor_fechamento)
                  SELECT ?, ?, ?, ?, ?, ?, ?
                  WHERE NOT EXISTS (
                      SELECT 1 FROM tb_sessao_caixa WHERE data_abertura = ?
                  )
              `).bind(s.id_caixa, s.id_usuario, s.data_abertura, s.valor_fundo_troco, s.data_fechamento, s.status, s.valor_fechamento, s.data_abertura));
                  stmts.push(env.DB.prepare(`
                  UPDATE tb_sessao_caixa
                  SET data_fechamento = ?, status = ?, valor_fechamento = ?
                  WHERE data_abertura = ?
              `).bind(s.data_fechamento, s.status, s.valor_fechamento, s.data_abertura));
              }
              await env.DB.batch(stmts);
              return new Response(JSON.stringify({ sucesso: true }), { status: 200, headers });
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao sincronizar sessões.", detalhe: error.message }), { status: 500, headers });
          }
      }

      else if (method === "GET" && path === "/api/app/versao") {
          try {
              const { results } = await env.DB.prepare("SELECT versao, link_download FROM tb_versao ORDER BY id DESC LIMIT 1").all();
              if (results.length > 0) {
                  return new Response(JSON.stringify(results[0]), { status: 200, headers });
              } else {
                  return new Response(JSON.stringify({ erro: "Nenhuma versão encontrada" }), { status: 404, headers });
              }
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao buscar versão" }), { status: 500, headers });
          }
      }

      else if (method === "POST" && path === "/api/app/trocas") {
          try {
              const body = await obterDados();
              const stmts = [];
              for (const t of body) {
                  stmts.push(env.DB.prepare(`
                      INSERT INTO tb_trocas (tipo_troca, data_troca, id_vendedor, produto_retornado, quantidade)
                      VALUES (?, ?, ?, ?, ?)
                  `).bind(t.tipo_troca, t.data_troca, t.id_vendedor, t.produto_retornado, t.quantidade));
              }
              await env.DB.batch(stmts);
              return new Response(JSON.stringify({ sucesso: true }), { status: 201, headers });
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao sincronizar trocas na nuvem.", detalhe: error.message }), { status: 500, headers });
          }
      }

      // =====================================================================
      // ROTAS DA WEB E DASHBOARD (Importadas da api-base.js)
      // =====================================================================
      else if (method === "POST" && path === "/api/web/login") {
          try {
              const body = await obterDados();
              const stmt = env.DB.prepare("SELECT id, nome, nivel_acesso FROM tb_usuarios WHERE nome = ? AND senha = ?");
              const { results } = await stmt.bind(body.nome, body.senha).all();
              if (results.length > 0) {
                  return new Response(JSON.stringify({ sucesso: true, usuario: results[0] }), { status: 200, headers });
              } else {
                  return new Response(JSON.stringify({ sucesso: false, erro: "Usuário ou senha incorretos!" }), { status: 401, headers });
              }
          } catch (error) {
              return new Response(JSON.stringify({ sucesso: false, erro: "Erro no servidor." }), { status: 500, headers });
          }
      }

      if (path === "/api/web/dashboard" && method === "GET") {
      try {
        // Vendas de Hoje
        const sqlVendasHoje = `SELECT COALESCE(SUM(total), 0) AS total_vendas, COUNT(id) AS total_atendimentos FROM tb_vendas WHERE status = 'pago' AND DATE(data_hora) = DATE('now')`;
        const { results: resVendas } = await env.DB.prepare(sqlVendasHoje).all();
        const vendas = resVendas[0] || { total_vendas: 0, total_atendimentos: 0 };
        
        // Alertas de Estoque
        const sqlAlertas = `SELECT COUNT(id) AS total_alertas FROM tb_produtos WHERE quantidade <= quantidade_minima`;
        const { results: resAlertas } = await env.DB.prepare(sqlAlertas).all();
        const alertas = resAlertas[0] || { total_alertas: 0 };

        // NOVO: Promoções Ativas
        const sqlPromocoes = `SELECT COUNT(id) AS total_promocoes FROM tb_produtos WHERE em_promocao = 1`;
        const { results: resPromocoes } = await env.DB.prepare(sqlPromocoes).all();
        const promocoes = resPromocoes[0] || { total_promocoes: 0 };

        // Retorna todos os dados juntos
        return new Response(JSON.stringify({ 
            vendasHoje: vendas.total_vendas, 
            atendimentosHoje: vendas.total_atendimentos, 
            alertasEstoque: alertas.total_alertas,
            promocoesAtivas: promocoes.total_promocoes // <-- Novo campo
        }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ erro: "Erro ao consultar métricas do dashboard." }), { status: 500, headers: corsHeaders });
      }
    }

      else if (method === "GET" && path === "/api/web/graficos") {
          try {
              const { results: resFat } = await env.DB.prepare(`SELECT DATE(data_hora) as data, SUM(total) as valor FROM tb_vendas WHERE status = 'pago' GROUP BY DATE(data_hora) ORDER BY data DESC LIMIT 7`).all();
              const { results: resPag } = await env.DB.prepare(`SELECT metodo, SUM(valor) as total FROM tb_pagamentos GROUP BY metodo`).all();
              const { results: resProd } = await env.DB.prepare(`SELECT p.nome, SUM(i.quantidade) as qtd FROM tb_itens_venda i JOIN tb_produtos p ON i.id_produto = p.id GROUP BY p.id ORDER BY qtd DESC LIMIT 5`).all();
              const { results: resFilial } = await env.DB.prepare(`SELECT f.nome_fantasia as nome, SUM(v.total) as valor FROM tb_vendas v JOIN tb_sessao_caixa s ON v.id_sessao_caixa = s.id JOIN tb_caixa c ON s.id_caixa = c.id JOIN tb_filiais f ON c.id_filial = f.id WHERE v.status = 'pago' GROUP BY f.id`).all();
              return new Response(JSON.stringify({ faturamento: resFat, pagamentos: resPag, produtos: resProd, filiais: resFilial }), { status: 200, headers });
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao gerar gráficos." }), { status: 500, headers });
          }
      }

      else if (method === "GET" && path === "/api/nfe/pendentes") {
          try {
              const { results } = await env.DB.prepare(
                  "SELECT id FROM tb_vendas WHERE chave_nfe IS NULL ORDER BY id ASC"
              ).all();
              return new Response(JSON.stringify(results), { headers });
          } catch (e) {
              return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
          }
      }

      else if (method === "GET" && path.match(/\/api\/nfe\/venda\/(\d+)/)) {
          const idVenda = path.match(/\/api\/nfe\/venda\/(\d+)/)[1];
          try {
              const queryVenda = `
        SELECT
          v.id as id_pedido, v.total as total_final, v.subtotal as total_produtos, v.desconto as total_frete,
          c.cpf_cnpj as cpf, c.nome as cliente_nome, c.logradouro, c.numero, c.bairro, c.cidade, c.uf, c.cod_mun_ibge, c.cep
        FROM tb_vendas v
        LEFT JOIN tb_clientes c ON v.id_cliente = c.id
        WHERE v.id = ?
      `;
              const venda = await env.DB.prepare(queryVenda).bind(idVenda).first();
              if (!venda) return new Response(JSON.stringify({ error: "Venda não encontrada" }), { status: 404, headers });

              const queryEmitente = `
        SELECT
          f.cnpj, f.nome_juridico as razao_social, f.inscricao_estadual as ie_emitente, f.crt as regime_tributario
        FROM tb_vendas v
        JOIN tb_sessao_caixa sc ON v.id_sessao_caixa = sc.id
        JOIN tb_caixa cx ON sc.id_caixa = cx.id
        JOIN tb_filiais f ON cx.id_filial = f.id
        WHERE v.id = ?
      `;
              const emitente = await env.DB.prepare(queryEmitente).bind(idVenda).first();

              const queryItens = `
        SELECT
          i.id_produto as produto_id, p.nome as nome_produto, i.quantidade, i.preco_unitario, i.subtotal,
          p.ncm, p.cest
        FROM tb_itens_venda i
        JOIN tb_produtos p ON i.id_produto = p.id
        WHERE i.id_venda = ?
      `;
              const itens = await env.DB.prepare(queryItens).bind(idVenda).all();

              return new Response(JSON.stringify({ pedido: venda, emitente: emitente, itens: itens.results }), { headers });
          } catch (e) {
              return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
          }
      }

      else if (method === "GET" && path === "/api/web/produtos") {
          try {
              const { results } = await env.DB.prepare("SELECT * FROM tb_produtos").all();
              return new Response(JSON.stringify(results), { status: 200, headers });
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao carregar produtos." }), { status: 500, headers });
          }
      }

      else if (method === "POST" && path === "/api/web/produtos") {
          try {
              const body = await obterDados();
              const stmt = env.DB.prepare(`
        INSERT INTO tb_produtos (
          nome, codigo_barras, preco_venda, quantidade, quantidade_minima, unidade_venda,
          custo, cest, aliquotas_imposto, ncm, valor_promocional, em_promocao, lote, validade, id_filial, foto, codigo_geral
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
              await stmt.bind(
                  body.nome || null,
                  body.codigo_barras || null,
                  body.preco_venda || 0,
                  body.quantidade || 0,
                  body.quantidade_minima || 0,
                  body.unidade_venda || 'Un',
                  body.custo || null,
                  body.cest || null,
                  body.aliquotas_imposto || null,
                  body.ncm || null,
                  body.valor_promocional || null,
                  body.em_promocao || 0,
                  body.lote || null,
                  body.validade || null,
                  body.foto || null,
                  body.codigo_geral || null
              ).run();

              return new Response(JSON.stringify({ sucesso: true }), { status: 201, headers });
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao adicionar produto.", detalhe: error.message }), { status: 500, headers });
          }
      }

      else if (method === "PUT" && path.startsWith("/api/web/produtos/")) {
          try {
              const id = path.split('/').pop();
              const body = await obterDados();
              const stmt = env.DB.prepare(`
        UPDATE tb_produtos
        SET nome = ?, codigo_barras = ?, preco_venda = ?, quantidade = ?, quantidade_minima = ?, unidade_venda = ?,
            custo = ?, cest = ?, aliquotas_imposto = ?, ncm = ?, valor_promocional = ?, em_promocao = ?, lote = ?, validade = ?, foto = ?, codigo_geral = ?
        WHERE id = ?
      `);
              await stmt.bind(
                  body.nome || null,
                  body.codigo_barras || null,
                  body.preco_venda || 0,
                  body.quantidade || 0,
                  body.quantidade_minima || 0,
                  body.unidade_venda || 'Un',
                  body.custo || null,
                  body.cest || null,
                  body.aliquotas_imposto || null,
                  body.ncm || null,
                  body.valor_promocional || null,
                  body.em_promocao || 0,
                  body.lote || null,
                  body.validade || null,
                  body.foto || null,
                  body.codigo_geral || null,
                  id
              ).run();

              return new Response(JSON.stringify({ sucesso: true }), { status: 200, headers });
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao atualizar produto." }), { status: 500, headers });
          }
      }

      else if (method === "DELETE" && path.startsWith("/api/web/produtos/")) {
          try {
              const id = path.split('/').pop();
              await env.DB.prepare("DELETE FROM tb_produtos WHERE id = ?").bind(id).run();
              return new Response(JSON.stringify({ sucesso: true }), { status: 200, headers });
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao excluir produto." }), { status: 500, headers });
          }
      }

      // =====================================================================
      // UPLOAD DE IMAGEM PARA O CLOUDFLARE R2
      // =====================================================================
      else if (method === "POST" && path === "/api/web/upload") {
          try {
              const formData = await request.formData();
              const file = formData.get("file");

              if (!file) {
                  return new Response(JSON.stringify({ erro: "Nenhum arquivo enviado" }), { status: 400, headers });
              }

              // Gera um nome único para a imagem (ex: 169123456_foto.png)
              const nomeArquivo = `\({Date.now()}_\){file.name.replace(/\s+/g, '_')}`;

              // Salva no R2 (Usando o binding BUCKET_PRODUTOS configurado no Cloudflare)
              await env.BUCKET_PRODUTOS.put(nomeArquivo, file.stream(), {
                  httpMetadata: { contentType: file.type }
              });

              // Link corrigido apontando diretamente para o Public Access do R2
              const urlPublica = `https://pub-cef0af4ec14641d69ab30f7d560f9387.r2.dev/${nomeArquivo}`;

              return new Response(JSON.stringify({ sucesso: true, url: urlPublica }), { status: 201, headers });
          } catch (error) {
              return new Response(JSON.stringify({ erro: "Erro ao salvar no R2.", detalhe: error.message }), { status: 500, headers });
          }
      }

      // =======================================================
      // FUNCIONÁRIOS: GET DADOS PESSOAIS (SELECT)
      // =======================================================
      else if (method === "GET" && path === "/api/web/funcionarios/pessoal") {
          try {
              const { results } = await env.DB.prepare(
                  "SELECT id, nome_completo, data_nascimento, genero, raca, estado_civil, nacionalidade, naturalidade, cpf, orgao_emissor, email, telefone, contato_emergencia, pcd, escolaridade, formacao_academica, logradouro, numero, bairro, cidade, cep, complemento, status FROM tb_funcionarios ORDER BY id ASC"
              ).all();
              return new Response(JSON.stringify(results), { headers });
          } catch (e) {
              return new Response(JSON.stringify({ error: "Erro GET Pessoal: " + e.message }), { status: 500, headers });
          }
      }

      // =======================================================
      // FUNCIONÁRIOS: GET DADOS PROFISSIONAIS (SELECT)
      // =======================================================
      else if (method === "GET" && path === "/api/web/funcionarios/profissional") {
          try {
              const { results } = await env.DB.prepare(
                  "SELECT id_funcionario, data_admissao, tipo, cargo, nivel_senioridade, setor, gestor, tempo_empregado, modelo_trabalho, escala_trabalho, salario_base, tipo_remuneracao, banco, agencia, chave_pix, centro_custo, data_demissao, tipo_demissao, motivo_demissao FROM tb_funcionarios_complemento ORDER BY id_funcionario ASC"
              ).all();
              return new Response(JSON.stringify(results), { headers });
          } catch (e) {
              return new Response(JSON.stringify({ error: "Erro GET Profissional: " + e.message }), { status: 500, headers });
          }
      }

      // =======================================================
      // FUNCIONÁRIOS: POST (CADASTRAR NOVO COM ID MANUAL)
      // =======================================================
      else if (method === "POST" && path === "/api/web/funcionarios") {
          try {
              const body = await obterDados();

              // 1. GERAÇÃO MANUAL DO ID: Pega o maior ID atual e soma 1
              const maxIdResult = await env.DB.prepare("SELECT MAX(id) as maxId FROM tb_funcionarios").first();
              const novoId = (maxIdResult && maxIdResult.maxId !== null ? maxIdResult.maxId : 0) + 1;

              // 2. Insere na tabela principal forçando o novoId manualmente
              const stmtFuncionario = env.DB.prepare(`
        INSERT INTO tb_funcionarios (
          id, nome_completo, data_nascimento, genero, raca, estado_civil, nacionalidade, 
          naturalidade, cpf, orgao_emissor, email, telefone, contato_emergencia, 
          pcd, escolaridade, formacao_academica, logradouro, numero, bairro, 
          cidade, cep, complemento, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

              await stmtFuncionario.bind(
                  novoId, body.nome_completo, body.data_nascimento, body.genero, body.raca, body.estado_civil, body.nacionalidade,
                  body.naturalidade, body.cpf, body.orgao_emissor, body.email, body.telefone, body.contato_emergencia,
                  body.pcd, body.escolaridade, body.formacao_academica, body.logradouro, body.numero, body.bairro,
                  body.cidade, body.cep, body.complemento, body.status
              ).run();

              // 3. Insere na tabela de complemento usando o mesmo novoId
              const stmtComplemento = env.DB.prepare(`
        INSERT INTO tb_funcionarios_complemento (
          id_funcionario, data_admissao, tipo, cargo, nivel_senioridade, 
          setor, gestor, tempo_empregado, modelo_trabalho, escala_trabalho, 
          salario_base, tipo_remuneracao, banco, agencia, chave_pix, centro_custo, 
          data_demissao, tipo_demissao, motivo_demissao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

              await stmtComplemento.bind(
                  novoId, body.data_admissao, body.tipo, body.cargo, body.nivel_senioridade,
                  body.setor, body.gestor, body.tempo_empregado, body.modelo_trabalho, body.escala_trabalho,
                  body.salario_base, body.tipo_remuneracao, body.banco, body.agencia, body.chave_pix, body.centro_custo,
                  body.data_demissao, body.tipo_demissao, body.motivo_demissao
              ).run();

              return new Response(JSON.stringify({ success: true, id: novoId }), { status: 201, headers });
          } catch (e) {
              return new Response(JSON.stringify({ error: "POST Funcionario: " + e.message }), { status: 500, headers });
          }
      }

      // =======================================================
      // FUNCIONÁRIOS: PUT (EDITAR EXISTENTE COM TRAVA DE SEGURANÇA)
      // =======================================================
      else if (method === "PUT" && path.startsWith("/api/web/funcionarios/")) {
          try {
              const id = path.split('/').pop();
              const body = await obterDados();

              // 1. Atualiza tabela principal
              const stmtFuncionario = env.DB.prepare(`
        UPDATE tb_funcionarios SET 
          nome_completo=?, data_nascimento=?, genero=?, raca=?, estado_civil=?, nacionalidade=?, 
          naturalidade=?, cpf=?, orgao_emissor=?, email=?, telefone=?, contato_emergencia=?, 
          pcd=?, escolaridade=?, formacao_academica=?, logradouro=?, numero=?, bairro=?, 
          cidade=?, cep=?, complemento=?, status=?
        WHERE id = ?
      `);

              await stmtFuncionario.bind(
                  body.nome_completo, body.data_nascimento, body.genero, body.raca, body.estado_civil, body.nacionalidade,
                  body.naturalidade, body.cpf, body.orgao_emissor, body.email, body.telefone, body.contato_emergencia,
                  body.pcd, body.escolaridade, body.formacao_academica, body.logradouro, body.numero, body.bairro,
                  body.cidade, body.cep, body.complemento, body.status, id
              ).run();

              // 2. Verifica se a ficha profissional já existe
              const checkComplemento = await env.DB.prepare("SELECT id FROM tb_funcionarios_complemento WHERE id_funcionario = ?").bind(id).first();

              if (checkComplemento) {
                  // Se existe, faz UPDATE normal
                  const stmtComplemento = env.DB.prepare(`
          UPDATE tb_funcionarios_complemento SET 
            data_admissao=?, tipo=?, cargo=?, nivel_senioridade=?, 
            setor=?, gestor=?, tempo_empregado=?, modelo_trabalho=?, escala_trabalho=?, 
            salario_base=?, tipo_remuneracao=?, banco=?, agencia=?, chave_pix=?, centro_custo=?, 
            data_demissao=?, tipo_demissao=?, motivo_demissao=?
          WHERE id_funcionario = ?
        `);
                  await stmtComplemento.bind(
                      body.data_admissao, body.tipo, body.cargo, body.nivel_senioridade,
                      body.setor, body.gestor, body.tempo_empregado, body.modelo_trabalho, body.escala_trabalho,
                      body.salario_base, body.tipo_remuneracao, body.banco, body.agencia, body.chave_pix, body.centro_custo,
                      body.data_demissao, body.tipo_demissao, body.motivo_demissao, id
                  ).run();
              } else {
                  // Se não existe, faz INSERT para garantir que os dados não se percam
                  const stmtComplemento = env.DB.prepare(`
          INSERT INTO tb_funcionarios_complemento (
            id_funcionario, data_admissao, tipo, cargo, nivel_senioridade, 
            setor, gestor, tempo_empregado, modelo_trabalho, escala_trabalho, 
            salario_base, tipo_remuneracao, banco, agencia, chave_pix, centro_custo, 
            data_demissao, tipo_demissao, motivo_demissao
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
                  await stmtComplemento.bind(
                      id, body.data_admissao, body.tipo, body.cargo, body.nivel_senioridade,
                      body.setor, body.gestor, body.tempo_empregado, body.modelo_trabalho, body.escala_trabalho,
                      body.salario_base, body.tipo_remuneracao, body.banco, body.agencia, body.chave_pix, body.centro_custo,
                      body.data_demissao, body.tipo_demissao, body.motivo_demissao
                  ).run();
              }

              return new Response(JSON.stringify({ success: true }), { status: 200, headers });
          } catch (e) {
              return new Response(JSON.stringify({ error: "PUT Funcionario: " + e.message }), { status: 500, headers });
          }
      }
      
      return new Response(JSON.stringify({ erro: `Rota não encontrada: ${path}` }), { status: 404, headers });
    } catch (e) {
      return new Response(JSON.stringify({ erro: e.message }), { status: 500, headers });
    }
  }
};