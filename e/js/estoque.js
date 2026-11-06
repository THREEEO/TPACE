const URL_BASE = "https://codecream.larissagazoli45.workers.dev";
let listaProdutos = [];
let codigosBipados = [];

// ==========================================
// AVISOS E CONFIRMAÇÕES (LIQUID GLASS)
// ==========================================
window.mostrarAviso = function(mensagem, tipo = 'erro', titulo = '') {
    let container = document.querySelector('.tpace-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'tpace-toast-container';
        document.body.appendChild(container);
    }
    const titulosPadrao = { sucesso: 'Sucesso', erro: 'Erro', aviso: 'Atenção' };
    const iconesPadrao = { sucesso: '✓', erro: '!', aviso: 'i' };

    const toast = document.createElement('div');
    toast.className = `tpace-toast toast-${tipo}`;
    toast.innerHTML = `
        <div class="tpace-toast-icon">${iconesPadrao[tipo] || '!'}</div>
        <div class="tpace-toast-body">
            <span class="tpace-toast-title">${titulo || titulosPadrao[tipo]}</span>
            <span class="tpace-toast-msg">${mensagem}</span>
        </div>
        <button class="tpace-toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'toastFadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
};

window.confirmarAcao = function(mensagem, titulo = 'Confirmar Exclusão') {
    return new Promise((resolve) => {
        let overlay = document.getElementById('tpace-confirm-modal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'tpace-confirm-modal';
            overlay.className = 'tpace-confirm-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div class="tpace-confirm-box">
                <div class="tpace-confirm-icon">!</div>
                <div class="tpace-confirm-title">${titulo}</div>
                <div class="tpace-confirm-text">${mensagem}</div>
                <div class="tpace-confirm-actions">
                    <button type="button" class="btn btn-outline" id="tpace-btn-cancel">Cancelar</button>
                    <button type="button" class="btn" id="tpace-btn-ok">Confirmar</button>
                </div>
            </div>
        `;
        requestAnimationFrame(() => overlay.classList.add('active'));

        const fechar = (res) => {
            overlay.classList.remove('active');
            resolve(res);
        };
        document.getElementById('tpace-btn-cancel').onclick = () => fechar(false);
        document.getElementById('tpace-btn-ok').onclick = () => fechar(true);
    });
};

document.addEventListener("DOMContentLoaded", function() {
    carregarProdutos();
    document.getElementById('form-produto').addEventListener('submit', salvarProduto);

    const inputPesquisa = document.getElementById('inputPesquisa');
    let debounceTimer;
    if (inputPesquisa) {
        inputPesquisa.addEventListener('input', (evento) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => filtrarTabela(evento.target.value.trim().toLowerCase()), 300);
        });
    }

    const inputBipar = document.getElementById('input-bipar');
    if (inputBipar) {
        inputBipar.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                const codigo = this.value.trim();
                if (codigo && !codigosBipados.includes(codigo)) {
                    codigosBipados.push(codigo);
                    atualizarListaCodigos();
                    this.value = ''; 
                }
            }
        });
    }
});

async function carregarProdutos() {
    const tbody = document.getElementById('tabela-estoque');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Carregando produtos...</td></tr>';
         
    try {
        const resposta = await fetch(`${URL_BASE}/produtos`);
        listaProdutos = await resposta.json();
        renderizarTabela(listaProdutos);
    } catch (erro) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Erro ao carregar o estoque.</td></tr>';
        mostrarAviso("Não foi possível carregar a lista de produtos.", "erro");
    }
}

function renderizarTabela(produtos) {
    const tbody = document.getElementById('tabela-estoque');
    tbody.innerHTML = '';
         
    if (produtos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Nenhum produto.</td></tr>';
        return;
    }

    produtos.forEach(prod => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${prod.codigo_barras || 'N/A'}</td>
            <td>${prod.nome_produto}</td>
            <td class="col-desktop">${prod.tipo || '-'}</td>
            <td class="col-desktop">${prod.quantidade || 0}</td>
            <td class="col-desktop">R$ ${prod.preco || '0,00'}</td>
            <td class="col-desktop"><span class="status-badge status-good">Estoque</span></td>
            <td class="col-desktop action-links">
                <button class="btn-action btn-edit" onclick="abrirModalEditar('${prod.id_cardapio}')">Editar</button>
                <button class="btn-action btn-delete" onclick="excluirProduto('${prod.id_cardapio}', '${prod.nome_produto}')">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarTabela(termo) {
    if (!termo) return renderizarTabela(listaProdutos);
    const filtrados = listaProdutos.filter(prod => {
        const nome = String(prod.nome_produto || "").toLowerCase();
        const codigo = String(prod.codigo_barras || "").toLowerCase();
        return nome.includes(termo) || codigo.includes(termo);
    });
    renderizarTabela(filtrados);
}

// ==========================================
// CONTROLES MODAL
// ==========================================
window.abrirModalNovo = function() {
    document.getElementById('modal-titulo').innerText = "Adicionar Produto";
    document.getElementById('form-produto').reset();
    document.getElementById('prod-id').value = "";
    document.getElementById('btn-salvar-edicao').style.display = 'none';
    document.getElementById('btn-proximo').style.display = 'inline-block';
    codigosBipados = [];
    atualizarListaCodigos();
    voltarPasso1();
    document.getElementById('modal-produto').classList.add('active');
};

window.abrirModalEditar = function(id_cardapio) {
    const produto = listaProdutos.find(p => p.id_cardapio == id_cardapio);
    if (!produto) return;
              
    document.getElementById('modal-titulo').innerText = "Editar Produto";
    document.getElementById('prod-id').value = produto.id_cardapio;
              
    // Dados Básicos e Fiscais
    document.getElementById('prod-nome').value = produto.nome_produto || "";
    document.getElementById('prod-codigo').value = produto.codigo_barras || "";
    document.getElementById('prod-preco').value = produto.preco || "";
    document.getElementById('prod-qtd').value = produto.quantidade || 0;
    document.getElementById('prod-minimo').value = produto.quantidade_minima || 0;
    document.getElementById('prod-unidade').value = produto.unidade_venda || "Un";
    document.getElementById('prod-em-promocao').value = produto.em_promocao ? "1" : "0";
    document.getElementById('prod-custo').value = produto.custo || "";
    document.getElementById('prod-promocional').value = produto.valor_promocional || "";
    document.getElementById('prod-imposto').value = produto.aliquotas_imposto || "";
    document.getElementById('prod-ncm').value = produto.ncm || "";
    document.getElementById('prod-cest').value = produto.cest || "";
    document.getElementById('prod-lote').value = produto.lote || "";
              
    if (produto.validade && produto.validade.includes('T')) {
        document.getElementById('prod-validade').value = produto.validade.split('T')[0];
    } else {
        document.getElementById('prod-validade').value = produto.validade || "";
    }
              
    // Classificação e Detalhes (sem marca, pode_conter e ingredientes)
    document.getElementById('prod-categoria').value = produto.categoria || "";
    document.getElementById('prod-linha').value = produto.linha || "";
    document.getElementById('prod-tipo').value = produto.tipo || "";
    document.getElementById('prod-sabor').value = produto.sabor || "";
    document.getElementById('prod-tamanho').value = produto.tamanho || "";
    document.getElementById('prod-peso').value = produto.peso_liquido || "";
    document.getElementById('prod-freezer').value = produto.frezzer || "";
    document.getElementById('prod-alergias').value = produto.alergias || "";
    document.getElementById('prod-observacoes').value = produto.observacoes || "";
              
    document.getElementById('btn-salvar-edicao').style.display = 'inline-block';
    document.getElementById('btn-proximo').style.display = 'none';
              
    voltarPasso1();
    document.getElementById('modal-produto').classList.add('active');
};

window.fecharModal = function() {
    document.getElementById('modal-produto').classList.remove('active');
    document.getElementById('form-produto').reset();
    document.getElementById('prod-id').value = "";
};

window.irParaPasso2 = function() {
    const form = document.getElementById('form-produto');
    if (!form.reportValidity()) return; 
    document.getElementById('passo-1').style.display = 'none';
    document.getElementById('passo-2').style.display = 'block';
};

window.voltarPasso1 = function() {
    document.getElementById('passo-2').style.display = 'none';
    document.getElementById('passo-1').style.display = 'block';
};

window.atualizarListaCodigos = function() {
    const divLista = document.getElementById('lista-codigos');
    if(!divLista) return;
    divLista.innerHTML = '';
    codigosBipados.forEach((cod, index) => {
        divLista.innerHTML += `
        <div style="display: flex; justify-content: space-between; background: var(--bg-pesquisa); padding: 8px 12px; border-radius: 4px; color: var(--text-escuro);">
            <span><i class="fas fa-barcode"></i> ${cod}</span>
            <span style="color: var(--chart-rosa); cursor: pointer;" onclick="removerCodigo(${index})"><i class="fas fa-trash"></i></span>
        </div>`;
    });
};

window.removerCodigo = function(index) {
    codigosBipados.splice(index, 1);
    atualizarListaCodigos();
};

window.gerarCodigoInterno5Digitos = function() {
    let codigo = '';
    for (let i = 0; i < 5; i++) codigo += Math.floor(Math.random() * 10);
    if (!codigosBipados.includes(codigo)) {
        codigosBipados.push(codigo);
        atualizarListaCodigos();
    } else {
        window.gerarCodigoInterno5Digitos();
    }
};

async function salvarProduto(event) {
    event.preventDefault();
    const btn = event.submitter;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    const idValue = document.getElementById('prod-id').value;
    const isNovo = (idValue === "");

    const dadosFormulario = {
        id: idValue,
        nome: document.getElementById('prod-nome').value,
        codigo_barras: document.getElementById('prod-codigo').value,
        preco: document.getElementById('prod-preco').value,
        quantidade: document.getElementById('prod-qtd').value,
        quantidade_minima: document.getElementById('prod-minimo').value,
        unidade_venda: document.getElementById('prod-unidade').value,
        em_promocao: document.getElementById('prod-em-promocao').value,
        custo: document.getElementById('prod-custo').value,
        valor_promocional: document.getElementById('prod-promocional').value,
        aliquotas_imposto: document.getElementById('prod-imposto').value,
        ncm: document.getElementById('prod-ncm').value,
        cest: document.getElementById('prod-cest').value,
        lote: document.getElementById('prod-lote').value,
        validade: document.getElementById('prod-validade').value,
        categoria: document.getElementById('prod-categoria').value,
        linha: document.getElementById('prod-linha').value,
        tipo: document.getElementById('prod-tipo').value,
        sabor: document.getElementById('prod-sabor').value,
        tamanho: document.getElementById('prod-tamanho').value,
        peso_liquido: document.getElementById('prod-peso').value,
        frezzer: document.getElementById('prod-freezer').value,
        alergias: document.getElementById('prod-alergias').value,
        observacoes: document.getElementById('prod-observacoes').value,
        foto: document.getElementById('prod-imagem-url') ? document.getElementById('prod-imagem-url').value : null
    };

    try {
        if (isNovo) {
            if (codigosBipados.length === 0) codigosBipados.push(dadosFormulario.codigo_barras || ""); 
            const promessas = codigosBipados.map(async codigo => {
                const dadosLote = { ...dadosFormulario, codigo_barras: codigo };
                const res = await fetch(`${URL_BASE}/produto/cadastrar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dadosLote)
                });
                                                  
                if (!res.ok) {
                    let msg = "Erro desconhecido";
                    try { const errObj = await res.json(); if(errObj.erro) msg = errObj.erro; } catch(e){}
                    throw new Error(msg);
                }
            });
            await Promise.all(promessas);
        } else {
            const res = await fetch(`${URL_BASE}/produto/editar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosFormulario)
            });
                                      
            if (!res.ok) {
                let msg = "Erro na API ao editar produto.";
                try { const errObj = await res.json(); if(errObj.erro) msg = errObj.erro; } catch(e){}
                throw new Error(msg);
            }
        }
                          
        fecharModal();
        carregarProdutos();
        mostrarAviso(isNovo ? "Produto cadastrado com sucesso!" : "Produto atualizado com sucesso!", "sucesso");
    } catch (erro) {
        mostrarAviso("Falha ao salvar! Detalhe: " + erro.message, "erro");
    } finally {
        btn.innerText = isNovo ? "Finalizar Cadastros" : "Salvar Alterações";
        btn.disabled = false;
    }
}

window.excluirProduto = async function(id_cardapio, nomeProduto) {
    const confirmado = await confirmarAcao(`Tem certeza que deseja excluir o produto "${nomeProduto}"?`);
    if (confirmado) {
        try {
            const res = await fetch(`${URL_BASE}/produto/excluir`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id_cardapio })
            });
            if(!res.ok) throw new Error("Erro interno do servidor.");
            carregarProdutos();
            mostrarAviso(`Produto "${nomeProduto}" excluído com sucesso!`, "sucesso");
        } catch (erro) {
            mostrarAviso("Erro de conexão ao excluir o produto.", "erro");
        }
    }
};