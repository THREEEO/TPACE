const URL_BASE = "https://codecream.larissagazoli45.workers.dev"; // Substitua pelo seu link

document.getElementById('form-login').addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const usuarioInput = document.getElementById('usuario').value; // O usuário digitará o nome aqui
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
            localStorage.setItem('tpace_usuario_id', dados.id);
            localStorage.setItem('tpace_usuario_nome', dados.nome);
            localStorage.setItem('tpace_usuario_nivel', dados.nivel);
            // Como sua API não retorna nivel_acesso, redirecionamos direto para o dashboard
            window.location.href = 'dashboard.html';
        } else {
            mensagemErro.innerText = dados.mensagem || "Credenciais incorretas!";
            botaoEntrar.innerText = "ENTRAR";
            botaoEntrar.disabled = false;
        }
    } catch (erro) {
        mensagemErro.innerText = "Erro ao conectar com o servidor.";
        botaoEntrar.innerText = "ENTRAR";
        botaoEntrar.disabled = false;
    }
});