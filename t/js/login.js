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
        const urlDaSuaAPI = "https://tpace-api.whyguiih.workers.dev/api/web/login";

        const resposta = await fetch(urlDaSuaAPI, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nome: usuarioInput,
                senha: senhaInput
            })
        });

        const dados = await resposta.json();

        if (dados.sucesso === true) {
            
            localStorage.setItem('tpace_usuario_nivel', dados.usuario.nivel_acesso);
            localStorage.setItem('tpace_usuario_nome', dados.usuario.nome);

            if (dados.usuario.nivel_acesso === 4 || dados.usuario.nivel_acesso === 5) {
                window.location.href = 'estoque.html';
            } 
            else if (dados.usuario.nivel_acesso === 3) {
                window.location.href = 'usuarios.html';
            } 
            else {
                window.location.href = 'dashboard.html';
            }

        } else {
            mensagemErro.innerText = dados.erro;
            botaoEntrar.innerText = "ENTRAR";
            botaoEntrar.disabled = false;
        }

    } catch (erro) {
        mensagemErro.innerText = "Erro ao conectar com o banco de dados.";
        botaoEntrar.innerText = "ENTRAR";
        botaoEntrar.disabled = false;
    }
});