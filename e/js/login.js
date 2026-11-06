const URL_BASE = "https://codecream.larissagazoli45.workers.dev";

function mostrarAviso(mensagem, tipo = 'erro', titulo = '') {
    let container = document.querySelector('.tpace-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'tpace-toast-container';
        document.body.appendChild(container);
    }
    const titulosPadrao = { sucesso: 'Sucesso', erro: 'Atenção', aviso: 'Aviso' };
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
}

document.getElementById('form-login').addEventListener('submit', async function(event) {
    event.preventDefault();
         
    const usuarioInput = document.getElementById('usuario').value;
    const senhaInput = document.getElementById('senha').value;
    const mensagemErro = document.getElementById('mensagem-erro');
    const botaoEntrar = document.querySelector('button[type="submit"]');

    mensagemErro.innerText = "";
    botaoEntrar.innerText = "CARREGANDO...";
    botaoEntrar.disabled = true;

    try {
        const resposta = await fetch(`${URL_BASE}/api/web/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: usuarioInput, senha: senhaInput })
        });
                 
        const dados = await resposta.json();

        if (dados.sucesso) {
            const user = dados.usuario || dados;
            localStorage.setItem('tpace_usuario_id', user.id);
            localStorage.setItem('tpace_usuario_nome', user.nome);
            localStorage.setItem('tpace_usuario_nivel', user.nivel_acesso ?? 0);
            mostrarAviso(`Bem-vindo(a), ${user.nome}!`, 'sucesso', 'Login Efetuado');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 600);
        } else {
            const msg = dados.erro || dados.mensagem || "Credenciais incorretas!";
            mensagemErro.innerText = msg;
            mostrarAviso(msg, 'erro', 'Falha no Login');
            botaoEntrar.innerText = "ENTRAR";
            botaoEntrar.disabled = false;
        }
    } catch (erro) {
        const msg = "Não foi possível conectar com o servidor.";
        mensagemErro.innerText = msg;
        mostrarAviso(msg, 'erro', 'Erro de Conexão');
        botaoEntrar.innerText = "ENTRAR";
        botaoEntrar.disabled = false;
    }
});