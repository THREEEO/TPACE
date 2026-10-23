document.addEventListener("DOMContentLoaded", function() {
    const nivelStr = localStorage.getItem('tpace_usuario_nivel');
    const nomeUsuario = localStorage.getItem('tpace_usuario_nome');

    if (nivelStr === null) {
        window.location.href = 'index.html';
        return;
    }

    const nivel = parseInt(nivelStr);

    const userSpan = document.querySelector('.user-info span');
    if (userSpan && nomeUsuario) {
        userSpan.innerText = nomeUsuario;
    }

    const linksMenu = document.querySelectorAll('.menu-link');
    
    linksMenu.forEach(link => {
        const href = link.getAttribute('href');
        
        if (href === 'index.html') return;

        let temPermissao = false;

        if (href.includes('dashboard.html')) {
            temPermissao = [0, 1, 2].includes(nivel);
        } else if (href.includes('relatorios.html')) {
            temPermissao = [0, 1, 2].includes(nivel);
        } else if (href.includes('usuarios.html')) {
            temPermissao = [0, 1, 3].includes(nivel);
        } else if (href.includes('estoque.html')) {
            temPermissao = [0, 1, 4, 5].includes(nivel);
        }

        if (!temPermissao) {
            link.style.display = 'none';
        }
    });

    if (window.location.pathname.includes('estoque.html')) {
        
        if (nivel === 5) {
            const botoesToolbar = document.querySelectorAll('.toolbar .btn');
            botoesToolbar.forEach(btn => btn.style.display = 'none');

            const thAcoes = document.querySelector('table th:last-child');
            if (thAcoes && thAcoes.innerText.toUpperCase().includes('AÇÕES')) {
                thAcoes.style.display = 'none';
            }

            const tdAcoes = document.querySelectorAll('.action-links');
            tdAcoes.forEach(td => td.style.display = 'none');
        }
    }

    const btnSair = document.getElementById('btn-sair');
    if (btnSair) {
        btnSair.addEventListener('click', function(e) {
            e.preventDefault();
            localStorage.clear();
            window.location.href = 'index.html';
        });
    }

    const btnMenu = document.querySelector('.mobile-menu-btn');
    const menuNav = document.querySelector('.topbar-menu');

    if (btnMenu && menuNav) {
        btnMenu.addEventListener('click', function() {
            menuNav.classList.toggle('open');
        });
    }
});