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

// ==========================================
// CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// ==========================================
const urlAPIPessoal = "https://codecream.larissagazoli45.workers.dev/api/web/funcionarios/pessoal";
const urlAPIProfissional = "https://codecream.larissagazoli45.workers.dev/api/web/funcionarios/profissional";
const urlAPIFuncionariosGeral = "https://codecream.larissagazoli45.workers.dev/api/web/funcionarios";

let listaFuncionarios = [];

// ==========================================
// TRADUTOR DE NÚMEROS DO BANCO
// ==========================================
const DICIONARIOS = {
    genero: { 1: 'Masculino', 2: 'Feminino', 3: 'Outros' },
    raca: { 1: 'Branca', 2: 'Preta', 3: 'Parda', 4: 'Amarela', 5: 'Indígena' },
    estado_civil: { 1: 'Solteiro(a)', 2: 'Casado(a)', 3: 'Divorciado(a)', 4: 'Viúvo(a)' },
    pcd: { 0: 'Não', 1: 'Sim', 'false': 'Não', 'true': 'Sim' },
    escolaridade: { 1: 'Fundamental', 2: 'Médio', 3: 'Técnico', 4: 'Superior', 5: 'Pós/MBA' },
    tipo_contrato: { 1: 'CLT', 2: 'PJ', 3: 'Estágio', 4: 'Temporário' },
    nivel_senioridade: { 1: 'Júnior', 2: 'Pleno', 3: 'Sênior', 4: 'Especialista', 5: 'Gestão' },
    modelo_trabalho: { 1: 'Presencial', 2: 'Híbrido', 3: 'Remoto' },
    escala_trabalho: { 1: '5x2', 2: '6x1', 3: '12x36', 4: 'Outra' },
    tipo_remuneracao: { 1: 'Fixo', 2: 'Comissão', 3: 'Fixo + Comissão', 4: 'Horista' },
    tipo_demissao: { 1: 'Sem Justa Causa', 2: 'Com Justa Causa', 3: 'Pedido de Demissão', 4: 'Acordo' }
};

function traduzir(dicionario, valor) {
    if (valor === null || valor === undefined || valor === "") return '-';
    const valStr = String(valor).toLowerCase();
    for (let key in dicionario) {
        if (String(key).toLowerCase() === valStr) return dicionario[key];
    }
    return valor;
}

// Verifica de forma segura se o funcionário está ativo ou se já foi demitido
function verificarSeAtivo(func) {
    const temDemissao = Boolean(
        (func.data_demissao && String(func.data_demissao).trim() !== "") ||
        (func.tipo_demissao !== null && func.tipo_demissao !== undefined && func.tipo_demissao !== "") ||
        (func.motivo_demissao && String(func.motivo_demissao).trim() !== "")
    );
    if (temDemissao) return false;
    if (func.status === 0 || func.status === '0' || func.status === false || String(func.status).toLowerCase() === 'inativo') {
        return false;
    }
    return true;
}

// Preenche inputs corretamente convertendo Boolean e Numéricos para o formato HTML
function preencherCampo(id, valor) {
    const el = document.getElementById(id);
    if (!el) return;
    if (valor === null || valor === undefined || valor === "") {
        el.value = "";
        return;
    }
    let valConvertido = valor;
    if (typeof valor === "boolean") valConvertido = valor ? "1" : "0";
    if (el.tagName === 'SELECT') {
        el.value = valConvertido.toString();
    } else if (el.type === 'date') {
        el.value = valConvertido.toString().split('T')[0];
    } else {
        el.value = valConvertido;
    }
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    carregarFuncionarios();
    const form = document.getElementById('form-funcionario');
    if (form) form.addEventListener('submit', window.salvarFuncionario);

    // Muda automaticamente o select de Status para "Inativo" (0) ao preencher dados de demissão
    const inputDataDemissao = document.getElementById('f-data_demissao');
    const selectTipoDemissao = document.getElementById('f-tipo_demissao');
    const inputMotivoDemissao = document.getElementById('f-motivo_demissao');
    const selectStatus = document.getElementById('f-status');

    function atualizarStatusAutomatico() {
        if (!selectStatus) return;
        const temDemissao = (inputDataDemissao && inputDataDemissao.value !== "") ||
                            (selectTipoDemissao && selectTipoDemissao.value !== "") ||
                            (inputMotivoDemissao && inputMotivoDemissao.value.trim() !== "");
        if (temDemissao) {
            selectStatus.value = "0";
        }
    }

    if (inputDataDemissao) inputDataDemissao.addEventListener('change', atualizarStatusAutomatico);
    if (selectTipoDemissao) selectTipoDemissao.addEventListener('change', atualizarStatusAutomatico);
    if (inputMotivoDemissao) inputMotivoDemissao.addEventListener('input', atualizarStatusAutomatico);

    const inputPesquisa = document.getElementById('inputPesquisa');
    if (inputPesquisa) {
        inputPesquisa.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            const filtrados = listaFuncionarios.filter(f => 
                (f.nome_completo && f.nome_completo.toLowerCase().includes(termo)) ||
                (f.cpf && f.cpf.toLowerCase().includes(termo))
            );
            renderizarTabela(filtrados);
        });
    }
});

// ==========================================
// 1. CARREGAR E MESCLAR
// ==========================================
async function carregarFuncionarios() {
    const tbody = document.getElementById('tabela-funcionarios');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Carregando funcionários...</td></tr>';
    try {
        // cache: 'no-store' garante que o navegador não mostre dados antigos após editar
        const [resPessoal, resProfissional] = await Promise.all([
            fetch(urlAPIPessoal, { cache: 'no-store' }),
            fetch(urlAPIProfissional, { cache: 'no-store' })
        ]);
        if (!resPessoal.ok || !resProfissional.ok) throw new Error("Erro nas rotas de GET");
        const dadosPessoal = await resPessoal.json();
        const dadosProfissional = await resProfissional.json();

        listaFuncionarios = dadosPessoal.map(funcPessoal => {
            const funcProfissional = dadosProfissional.find(p => Number(p.id_funcionario) === Number(funcPessoal.id)) || {};
            return { ...funcProfissional, ...funcPessoal, id: funcPessoal.id };
        });
                 
        renderizarTabela(listaFuncionarios);
        preencherSelectGestores(listaFuncionarios);
    } catch (erro) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--chart-rosa);">Erro ao conectar com a API. Verifique o console.</td></tr>';
    }
}

// ==========================================
// 2. RENDERIZAR TABELA PRINCIPAL
// ==========================================
function renderizarTabela(funcionarios) {
    const tbody = document.getElementById('tabela-funcionarios');
    tbody.innerHTML = '';
         
    if (funcionarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum funcionário encontrado.</td></tr>';
        return;
    }
    funcionarios.forEach(func => {
        const tipoContrato = traduzir(DICIONARIOS.tipo_contrato, func.tipo);
        const isAtivo = verificarSeAtivo(func);
        const statusBadge = isAtivo 
            ? '<span class="status-badge status-good">Ativo</span>' 
            : '<span class="status-badge status-critical">Inativo</span>';
                 
        // --- 1. LINHA PRINCIPAL ---
        const trPrincipal = document.createElement('tr');
        trPrincipal.className = "linha-produto";
        trPrincipal.onclick = (event) => {
            if (!event.target.classList.contains('clickable-name') && !event.target.classList.contains('btn-action')) {
                toggleDetalhesUsuario(func.id);
            }
        };
        trPrincipal.innerHTML = `
            <td><span class="clickable-name" onclick="abrirPaginaDetalhes(${func.id})">${func.nome_completo || '-'}</span></td>
            <td class="col-desktop">${tipoContrato}</td>
            <td class="col-desktop">${func.cargo || '-'}</td>
            <td class="col-desktop">${func.setor || '-'}</td>
            <td class="col-desktop">${statusBadge}</td>
            <td class="col-desktop action-links">
                <button class="btn-action btn-edit" onclick="event.stopPropagation(); abrirModalEditar(${func.id})">Editar</button>
            </td>
            <td class="td-seta">
                <i class="fas fa-chevron-down seta-tabela" id="seta-user-${func.id}"></i>
            </td>
        `;
        tbody.appendChild(trPrincipal);

        // --- 2. LINHA DA SANFONA (Visível apenas no Mobile) ---
        const trDetalhes = document.createElement('tr');
        trDetalhes.id = `detalhes-user-${func.id}`;
        trDetalhes.className = 'detalhes-row';
        trDetalhes.innerHTML = `
            <td colspan="2">
                <div class="detalhes-content">
                    <div class="detalhe-item"><b>Cargo:</b> <span>${func.cargo || '-'}</span></div>
                    <div class="detalhe-item"><b>Setor:</b> <span>${func.setor || '-'}</span></div>
                    <div class="detalhe-item"><b>Status:</b> ${statusBadge}</div>
                    <div class="detalhes-acoes action-links-mobile">
                        <button class="btn-action btn-edit" onclick="abrirModalEditar(${func.id})">Editar</button>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(trDetalhes);
    });
}

// ==========================================
// FUNÇÃO PARA ABRIR/FECHAR A SANFONA NO MOBILE
// ==========================================
window.toggleDetalhesUsuario = function(id) {
    const linha = document.getElementById(`detalhes-user-${id}`);
    const seta = document.getElementById(`seta-user-${id}`);
         
    if (linha && seta) {
        linha.classList.toggle('open');
        seta.classList.toggle('ativa');
    }
};

// ==========================================
// 3. PREENCHER LISTA DE GESTORES
// ==========================================
function preencherSelectGestores(funcionarios) {
    const selectGestor = document.getElementById('f-gestor');
    if (!selectGestor) return;
         
    selectGestor.innerHTML = '<option value="">Nenhum / Selecione</option>';
         
    funcionarios.forEach(func => {
        if (func.nome_completo && (func.nivel_senioridade == 5 || func.nivel_senioridade === '5')) {
            selectGestor.innerHTML += `<option value="${func.id}">${func.nome_completo}</option>`;
        }
    });
}

// ==========================================
// 4. PÁGINA DE DETALHES (SPA TRADUZIDA)
// ==========================================
window.abrirPaginaDetalhes = function(id) {
    const func = listaFuncionarios.find(f => Number(f.id) === Number(id));
    if (!func) return;
    document.getElementById('tela-lista').style.display = 'none';
    document.getElementById('tela-detalhes').style.display = 'block';
         
    document.getElementById('detalhe-nome-titulo').innerText = func.nome_completo || "Nome do Funcionário";
    document.getElementById('detalhe-cargo-titulo').innerText = (func.cargo || 'Cargo Indefinido') + (func.setor ? ` | ${func.setor}` : '');
    const renderItem = (label, valor) => `
        <div class="info-item"><span class="label">${label}</span><span class="valor">${valor || '-'}</span></div>
    `;
    const isAtivo = verificarSeAtivo(func);

    document.getElementById('box-pessoal-grid').innerHTML = `
        ${renderItem('CPF', func.cpf)}
        ${renderItem('Nascimento', func.data_nascimento ? String(func.data_nascimento).split('T')[0] : '')}
        ${renderItem('Gênero', traduzir(DICIONARIOS.genero, func.genero))}
        ${renderItem('Raça/Cor', traduzir(DICIONARIOS.raca, func.raca))}
        ${renderItem('Estado Civil', traduzir(DICIONARIOS.estado_civil, func.estado_civil))}
        ${renderItem('Nacionalidade', func.nacionalidade)}
        ${renderItem('Naturalidade', func.naturalidade)}
        ${renderItem('Órgão Emissor', func.orgao_emissor)}
        ${renderItem('Email', func.email)}
        ${renderItem('Telefone', func.telefone)}
        ${renderItem('Emergência', func.contato_emergencia)}
        ${renderItem('PCD', traduzir(DICIONARIOS.pcd, func.pcd))}
        ${renderItem('Escolaridade', traduzir(DICIONARIOS.escolaridade, func.escolaridade))}
        ${renderItem('Formação', func.formacao_academica)}
        ${renderItem('Endereço', (func.logradouro || '') + (func.numero ? `, ${func.numero}` : ''))}
        ${renderItem('Bairro', func.bairro)}
        ${renderItem('Cidade', func.cidade)}
        ${renderItem('CEP', func.cep)}
        ${renderItem('Complemento', func.complemento)}
        ${renderItem('Status', isAtivo ? 'Ativo' : 'Inativo')}
    `;
    let nomeGestor = '-';
    if (func.gestor) {
        const gestorObj = listaFuncionarios.find(f => Number(f.id) === Number(func.gestor));
        if (gestorObj) nomeGestor = gestorObj.nome_completo;
    }
    document.getElementById('box-profissional-grid').innerHTML = `
        ${renderItem('Data Admissão', func.data_admissao ? String(func.data_admissao).split('T')[0] : '')}
        ${renderItem('Tipo Contrato', traduzir(DICIONARIOS.tipo_contrato, func.tipo))}
        ${renderItem('Cargo', func.cargo)}
        ${renderItem('Nível/Senioridade', traduzir(DICIONARIOS.nivel_senioridade, func.nivel_senioridade))}
        ${renderItem('Setor', func.setor)}
        ${renderItem('Gestor', nomeGestor)}
        ${renderItem('Tempo Empregado', func.tempo_empregado)}
        ${renderItem('Modelo Trabalho', traduzir(DICIONARIOS.modelo_trabalho, func.modelo_trabalho))}
        ${renderItem('Escala', traduzir(DICIONARIOS.escala_trabalho, func.escala_trabalho))}
        ${renderItem('Salário Base', func.salario_base ? 'R$ ' + parseFloat(func.salario_base).toFixed(2) : '-')}
        ${renderItem('Remuneração', traduzir(DICIONARIOS.tipo_remuneracao, func.tipo_remuneracao))}
        ${renderItem('Banco', func.banco)}
        ${renderItem('Agência/Conta', func.agencia)}
        ${renderItem('Chave PIX', func.chave_pix)}
        ${renderItem('Centro Custo', func.centro_custo)}
        ${renderItem('Data Demissão', func.data_demissao ? String(func.data_demissao).split('T')[0] : '')}
        ${renderItem('Tipo Demissão', traduzir(DICIONARIOS.tipo_demissao, func.tipo_demissao))}
        ${renderItem('Motivo Demissão', func.motivo_demissao)}
    `;
};

window.voltarParaLista = function() {
    document.getElementById('tela-detalhes').style.display = 'none';
    document.getElementById('tela-lista').style.display = 'block';
};

// ==========================================
// 5. MODAL ADICIONAR / EDITAR
// ==========================================
window.abrirModalNovo = function() {
    document.getElementById('modal-titulo').innerText = "Adicionar Novo Funcionário";
    document.getElementById('form-funcionario').reset();
    document.getElementById('func-id').value = ""; 
    document.getElementById('modal-funcionario').classList.add('active');
};

window.abrirModalEditar = function(id) {
    const func = listaFuncionarios.find(f => Number(f.id) === Number(id));
    if (!func) return;
    document.getElementById('modal-titulo').innerText = "Editar Funcionário";
    document.getElementById('func-id').value = func.id;
         
    const mapeamento = [
        ['f-nome_completo', 'nome_completo'], ['f-data_nascimento', 'data_nascimento'], 
        ['f-genero', 'genero'], ['f-raca', 'raca'], ['f-estado_civil', 'estado_civil'], 
        ['f-nacionalidade', 'nacionalidade'], ['f-naturalidade', 'naturalidade'], 
        ['f-cpf', 'cpf'], ['f-orgao_emissor', 'orgao_emissor'], ['f-email', 'email'], 
        ['f-telefone', 'telefone'], ['f-contato_emergencia', 'contato_emergencia'], 
        ['f-pcd', 'pcd'], ['f-escolaridade', 'escolaridade'], ['f-formacao_academica', 'formacao_academica'], 
        ['f-cep', 'cep'], ['f-logradouro', 'logradouro'], ['f-numero', 'numero'], 
        ['f-complemento', 'complemento'], ['f-bairro', 'bairro'], ['f-cidade', 'cidade'], 
        ['f-data_admissao', 'data_admissao'], ['f-tipo_contrato', 'tipo'], 
        ['f-cargo', 'cargo'], ['f-nivel_senioridade', 'nivel_senioridade'], 
        ['f-setor', 'setor'], ['f-gestor', 'gestor'], ['f-tempo_empregado', 'tempo_empregado'], 
        ['f-modelo_trabalho', 'modelo_trabalho'], ['f-escala_trabalho', 'escala_trabalho'], 
        ['f-salario_base', 'salario_base'], ['f-tipo_remuneracao', 'tipo_remuneracao'], 
        ['f-centro_custo', 'centro_custo'], ['f-banco', 'banco'], ['f-agencia', 'agencia'], 
        ['f-chave_pix', 'chave_pix'], ['f-data_demissao', 'data_demissao'], 
        ['f-tipo_demissao', 'tipo_demissao'], ['f-motivo_demissao', 'motivo_demissao']
    ];
    mapeamento.forEach(([idInput, campoBD]) => {
        preencherCampo(idInput, func[campoBD]);
    });
    const statusSelect = document.getElementById('f-status');
    if (statusSelect) statusSelect.value = verificarSeAtivo(func) ? '1' : '0';
    document.getElementById('modal-funcionario').classList.add('active');
};

window.fecharModalForm = function() {
    document.getElementById('modal-funcionario').classList.remove('active');
};

// ==========================================
// 6. SALVAR FUNCIONÁRIO (POST/PUT)
// ==========================================
window.salvarFuncionario = async function(event) {
    event.preventDefault(); 
    const id = document.getElementById('func-id').value;
    const isNovo = (id === ""); 

    // CORRIGIDO: Não trata 0 como vazio
    const parseNum = (val) => (val === null || val === undefined || String(val).trim() === "") ? null : Number(val);
    const parseText = (val) => (!val || val.trim() === "") ? null : val.trim();

    const dataDemissao = parseText(document.getElementById('f-data_demissao').value);
    const tipoDemissao = parseNum(document.getElementById('f-tipo_demissao').value);
    const motivoDemissao = parseText(document.getElementById('f-motivo_demissao').value);

    // Se preencheu qualquer campo de demissão, o status vai como 0 (Inativo) automaticamente
    const foiDemitido = Boolean(dataDemissao || tipoDemissao !== null || motivoDemissao);
    const statusEscolhido = parseNum(document.getElementById('f-status').value);
    const statusFinal = foiDemitido ? 0 : (statusEscolhido === 0 ? 0 : 1);

    const dados = {
        nome_completo: document.getElementById('f-nome_completo').value,
        data_nascimento: parseText(document.getElementById('f-data_nascimento').value),
        genero: parseNum(document.getElementById('f-genero').value),
        raca: parseNum(document.getElementById('f-raca').value),
        estado_civil: parseNum(document.getElementById('f-estado_civil').value),
        nacionalidade: parseText(document.getElementById('f-nacionalidade').value),
        naturalidade: parseText(document.getElementById('f-naturalidade').value),
        cpf: parseText(document.getElementById('f-cpf').value),
        orgao_emissor: parseText(document.getElementById('f-orgao_emissor').value),
        email: parseText(document.getElementById('f-email').value),
        telefone: parseText(document.getElementById('f-telefone').value),
        contato_emergencia: parseText(document.getElementById('f-contato_emergencia').value),
        pcd: parseNum(document.getElementById('f-pcd').value),
        escolaridade: parseNum(document.getElementById('f-escolaridade').value),
        formacao_academica: parseText(document.getElementById('f-formacao_academica').value),
        cep: parseText(document.getElementById('f-cep').value),
        logradouro: parseText(document.getElementById('f-logradouro').value),
        numero: parseNum(document.getElementById('f-numero').value),
        complemento: parseText(document.getElementById('f-complemento').value),
        bairro: parseText(document.getElementById('f-bairro').value),
        cidade: parseText(document.getElementById('f-cidade').value),
        status: statusFinal,
        data_admissao: parseText(document.getElementById('f-data_admissao').value),
        tipo: parseNum(document.getElementById('f-tipo_contrato').value),
        cargo: parseText(document.getElementById('f-cargo').value),
        nivel_senioridade: parseNum(document.getElementById('f-nivel_senioridade').value),
        setor: parseText(document.getElementById('f-setor').value),
        gestor: parseNum(document.getElementById('f-gestor').value),
        tempo_empregado: parseText(document.getElementById('f-tempo_empregado').value),
        modelo_trabalho: parseNum(document.getElementById('f-modelo_trabalho').value),
        escala_trabalho: parseNum(document.getElementById('f-escala_trabalho').value),
        salario_base: document.getElementById('f-salario_base').value ? parseFloat(document.getElementById('f-salario_base').value) : null,
        tipo_remuneracao: parseNum(document.getElementById('f-tipo_remuneracao').value),
        centro_custo: parseText(document.getElementById('f-centro_custo').value),
        banco: parseText(document.getElementById('f-banco').value),
        agencia: parseNum(document.getElementById('f-agencia').value),
        chave_pix: parseText(document.getElementById('f-chave_pix').value),
        data_demissao: dataDemissao,
        tipo_demissao: tipoDemissao,
        motivo_demissao: motivoDemissao
    };

    try {
        const url = isNovo ? urlAPIFuncionariosGeral : `${urlAPIFuncionariosGeral}/${id}`;
        const metodo = isNovo ? 'POST' : 'PUT';
        const btn = event.submitter;
        const textoOriginal = btn.innerText;
        btn.innerText = "Salvando...";
        btn.disabled = true;

        const resposta = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (resposta.ok) {
            fecharModalForm();
            await carregarFuncionarios();
            if (document.getElementById('tela-detalhes').style.display === 'block' && !isNovo) {
                abrirPaginaDetalhes(Number(id));
            }
            mostrarAviso(isNovo ? "Funcionário cadastrado com sucesso!" : "Dados do funcionário atualizados!", "sucesso");
        } else {
            const erroMsg = await resposta.json();
            mostrarAviso("Erro ao salvar no banco: " + (erroMsg.error || "Erro Desconhecido"), "erro");
        }
                          
        btn.innerText = textoOriginal;
        btn.disabled = false;
    } catch (erro) {
        mostrarAviso("Erro fatal de conexão com a API.", "erro");
    }
};