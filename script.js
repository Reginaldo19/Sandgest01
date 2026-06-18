// ==================== IMPORTAÇÕES FIREBASE ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, update, remove, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

// ==================== CONFIGURAÇÃO FIREBASE ====================
const firebaseConfig = {
    apiKey: "AIzaSyBImtt43SlMdLtAiNUY26qpikIhG8ozyrY",
    authDomain: "escola-a907f.firebaseapp.com",
    databaseURL: "https://escola-a907f-default-rtdb.firebaseio.com",
    projectId: "escola-a907f",
    storageBucket: "escola-a907f.firebasestorage.app",
    messagingSenderId: "323325281431",
    appId: "1:323325281431:web:8a6dab5572fe541abd15d2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==================== VARIÁVEIS GLOBAIS ====================
let currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
if (!currentUser || currentUser.tipo !== 'Admin') {
    location.href = 'index.html';
}

let currentAdminData = null;
let allAlunos = {};
let allProfessores = {};
let allCoordenadores = {};
let allCursos = {};
let allTurmas = {};
let allDisciplinas = {};
let allFinanceiro = {};
let allAtividades = {};
let atividadesFiltradas = [];
let paginaAtual = 1;
const ITEMS_POR_PAGINA = 15;

// ==================== VARIÁVEIS DOS GRÁFICOS ====================
let studentChartInstance = null;
let teacherChartInstance = null;
let evolutionChartInstance = null;

// ==================== CONSTANTES ====================
const SENHA_PADRAO = "escola123";

// ==================== FUNÇÕES AUXILIARES ====================
function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function showToast(title, icon = 'success') {
    Swal.fire({
        title: title,
        icon: icon,
        toast: true,
        timer: 2000,
        showConfirmButton: false,
        position: 'top-end'
    });
}

function gerarMatricula() {
    return 'ALUNO' + new Date().getFullYear() + Math.floor(1000 + Math.random() * 9000);
}

function gerarIDProfessor() {
    return 'PROF' + new Date().getFullYear() + Math.floor(100 + Math.random() * 900);
}

// ==================== FUNÇÃO DE VERIFICAÇÃO DE SEGURANÇA ====================
async function verificarSenhaSegurancaAdmin() {
    if (!currentAdminData) {
        const adminRef = ref(db, 'Admin');
        const snapshot = await get(adminRef);
        const admins = snapshot.val() || {};
        for (let id in admins) {
            if (admins[id].email === currentUser.email) {
                currentAdminData = { id: id, ...admins[id] };
                break;
            }
        }
    }
    
    if (!currentAdminData) {
        Swal.fire('Erro', 'Não foi possível identificar o administrador logado.', 'error');
        return false;
    }
    
    const { value: senhaSeguranca } = await Swal.fire({
        title: '🔐 Verificação de Segurança Obrigatória',
        html: `
            <div class="text-center mb-3">
                <i class="fa-solid fa-shield-haltered" style="font-size: 3rem; color: var(--primary);"></i>
                <p class="mt-2">Para realizar esta operação, é necessário confirmar sua <strong>senha de segurança</strong>.</p>
                <p class="small text-muted">A senha de segurança é diferente da senha de login e foi definida no cadastro do administrador.</p>
            </div>
            <div class="mb-3">
                <label class="form-label">Senha de Segurança</label>
                <input type="password" id="senhaSegurancaInput" class="form-control" placeholder="Digite sua senha de segurança" required>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ Confirmar Operação',
        cancelButtonText: '❌ Cancelar',
        preConfirm: () => {
            const senha = document.getElementById('senhaSegurancaInput')?.value;
            if (!senha) {
                Swal.showValidationMessage('Digite sua senha de segurança');
                return false;
            }
            return senha;
        }
    });
    
    if (!senhaSeguranca) {
        return false;
    }
    
    if (currentAdminData.admin_key !== senhaSeguranca) {
        await Swal.fire({
            title: '⛔ Acesso Negado!',
            text: 'Senha de segurança incorreta. Operação cancelada por motivos de segurança.',
            icon: 'error',
            confirmButtonText: 'OK'
        });
        return false;
    }
    
    return true;
}

// ==================== SISTEMA DE ATIVIDADES ====================

// Função para registrar atividade
async function registrarAtividade(tipo, acao, detalhes, entidade = null) {
    try {
        // Verificar se o usuário está logado
        if (!currentUser) {
            console.warn('Usuário não logado, não é possível registrar atividade');
            return;
        }
        
        // Verificar se o firebase está disponível
        if (!db) {
            console.warn('Firebase não disponível, não é possível registrar atividade');
            return;
        }
        
        const atividadeRef = push(ref(db, 'atividades'));
        const data = {
            tipo: tipo,
            acao: acao,
            detalhes: detalhes || '',
            entidade: entidade || '',
            usuario: currentUser?.nome || 'Administrador',
            usuarioEmail: currentUser?.email || 'admin@escola.com',
            dataHora: new Date().toISOString(),
            timestamp: serverTimestamp(),
            navegador: navigator?.userAgent || 'N/A',
            ip: '---',
            visualizada: false
        };
        
        await set(atividadeRef, data);
        console.log('✅ Atividade registrada:', tipo, acao);
        
        // Atualizar badge
        atualizarBadgeAtividades();
    } catch (error) {
        console.error('❌ Erro ao registrar atividade:', error);
    }
}

// Função para atualizar badge de atividades não lidas
function atualizarBadgeAtividades() {
    const badge = document.getElementById('badgeAtividades');
    if (!badge) return;
    
    try {
        const agora = new Date();
        const ultimas24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
        
        const naoLidas = Object.values(allAtividades).filter(atv => {
            try {
                const dataAtv = new Date(atv.dataHora);
                const foiVisualizada = atv.visualizada || false;
                return dataAtv >= ultimas24h && !foiVisualizada;
            } catch (e) {
                return false;
            }
        }).length;
        
        if (naoLidas > 0) {
            badge.style.display = 'inline';
            badge.textContent = naoLidas > 99 ? '99+' : naoLidas;
        } else {
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao atualizar badge:', error);
    }
}

// Função para marcar atividades como visualizadas
function marcarAtividadesVisualizadas() {
    try {
        const atividadesRecentes = Object.entries(allAtividades).filter(([id, atv]) => {
            try {
                const dataAtv = new Date(atv.dataHora);
                const agora = new Date();
                const ultimas24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
                return dataAtv >= ultimas24h && !atv.visualizada;
            } catch (e) {
                return false;
            }
        });
        
        atividadesRecentes.forEach(([id, atv]) => {
            update(ref(db, `atividades/${id}`), { visualizada: true });
        });
    } catch (error) {
        console.error('Erro ao marcar atividades como visualizadas:', error);
    }
}

// ==================== FUNÇÕES DE EXCLUSÃO E EDIÇÃO COM SEGURANÇA ====================

async function deleteItemWithSecurity(path, id, nome) {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    const result = await Swal.fire({
        title: `⚠️ Remover ${nome}?`,
        text: 'Esta ação não pode ser desfeita',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sim, remover',
        cancelButtonText: 'Cancelar'
    });
    
    if (result.isConfirmed) {
        try {
            // Buscar dados do item antes de excluir
            const itemRef = ref(db, `${path}/${id}`);
            const snapshot = await get(itemRef);
            const dados = snapshot.val() || {};
            
            // Registrar atividade ANTES de excluir
            const nomeItem = dados.nome || dados.nomeCompleto || dados.matricula || 'ID: ' + id;
            await registrarAtividade('exclusao', `Removeu ${nome}: ${nomeItem}`, 
                `Path: ${path}/${id}, ID: ${id}`, nome);
            
            // Executar exclusão
            await remove(itemRef);
            showToast(`${nome} removido com sucesso`);
        } catch (error) {
            console.error('Erro ao excluir:', error);
            Swal.fire('Erro', 'Não foi possível remover o item', 'error');
        }
    }
}

async function editItemWithSecurity(path, id, data, customHtml = '') {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    // Preparar campos adicionais
    let camposAdicionais = '';
    if (path === 'professores') {
        camposAdicionais = `
            <div class="mb-3">
                <label class="form-label">Telefone</label>
                <input id="editTelefone" class="form-control" value="${escapeHtml(data.telefone || '')}">
            </div>
            <div class="mb-3">
                <label class="form-label">BI</label>
                <input id="editBi" class="form-control" value="${escapeHtml(data.bi || '')}">
            </div>
            <div class="mb-3">
                <label class="form-label">Morada</label>
                <input id="editMorada" class="form-control" value="${escapeHtml(data.morada || '')}">
            </div>
            <div class="mb-3">
                <label class="form-label">Observações</label>
                <input id="editObs" class="form-control" value="${escapeHtml(data.observacoes || '')}">
            </div>
        `;
    } else if (path === 'alunos') {
        camposAdicionais = `
            <div class="mb-3">
                <label class="form-label">Telefone Encarregado</label>
                <input id="editTel" class="form-control" value="${escapeHtml(data.telefoneEncarregado || '')}">
            </div>
            <div class="mb-3">
                <label class="form-label">Nome Encarregado</label>
                <input id="editNomeEnc" class="form-control" value="${escapeHtml(data.nomeEncarregado || '')}">
            </div>
            <div class="mb-3">
                <label class="form-label">Morada</label>
                <input id="editEnd" class="form-control" value="${escapeHtml(data.endereco || '')}">
            </div>
            <div class="mb-3">
                <label class="form-label">BI</label>
                <input id="editBi" class="form-control" value="${escapeHtml(data.bi || '')}">
            </div>
            <div class="mb-3">
                <label class="form-label">Status</label>
                <select id="editStatus" class="form-select">
                    <option value="Ativo" ${data.status === 'Ativo' ? 'selected' : ''}>Ativo</option>
                    <option value="Inativo" ${data.status === 'Inativo' ? 'selected' : ''}>Inativo</option>
                </select>
            </div>
        `;
    }
    
    let html = `
        <div class="mb-3">
            <label class="form-label">Nome Completo</label>
            <input id="editNome" class="form-control" value="${escapeHtml(data.nome)}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Email</label>
            <input id="editEmail" class="form-control" value="${escapeHtml(data.email || '')}" type="email">
        </div>
        ${camposAdicionais}
        ${customHtml}
    `;
    
    const result = await Swal.fire({
        title: '✏️ Editar ' + (data.nome || 'Registro'),
        html: html,
        showCancelButton: true,
        confirmButtonText: '💾 Salvar',
        cancelButtonText: 'Cancelar',
        width: '600px',
        preConfirm: () => {
            const nome = document.getElementById('editNome')?.value;
            if (!nome) {
                Swal.showValidationMessage('Informe o nome');
                return false;
            }
            
            const dadosAtualizados = {
                nome: nome,
                email: document.getElementById('editEmail')?.value || ''
            };
            
            // Campos específicos por tipo
            if (path === 'professores') {
                dadosAtualizados.telefone = document.getElementById('editTelefone')?.value || '';
                dadosAtualizados.bi = document.getElementById('editBi')?.value || '';
                dadosAtualizados.morada = document.getElementById('editMorada')?.value || '';
                dadosAtualizados.observacoes = document.getElementById('editObs')?.value || '';
            } else if (path === 'alunos') {
                dadosAtualizados.telefoneEncarregado = document.getElementById('editTel')?.value || '';
                dadosAtualizados.nomeEncarregado = document.getElementById('editNomeEnc')?.value || '';
                dadosAtualizados.endereco = document.getElementById('editEnd')?.value || '';
                dadosAtualizados.bi = document.getElementById('editBi')?.value || '';
                dadosAtualizados.status = document.getElementById('editStatus')?.value || 'Ativo';
            }
            
            return dadosAtualizados;
        }
    });
    
    if (result.value) {
        try {
            // Registrar atividade ANTES de atualizar
            const nomeAntigo = data.nome || 'registro';
            const nomeNovo = result.value.nome || nomeAntigo;
            await registrarAtividade('edicao', `Editou ${nomeAntigo}`, 
                `Path: ${path}/${id}, Nome: ${nomeAntigo} → ${nomeNovo}, ID: ${id}`, 'Edição');
            
            // Atualizar dados
            await update(ref(db, `${path}/${id}`), result.value);
            showToast('Atualizado com sucesso');
        } catch (error) {
            console.error('Erro ao editar:', error);
            Swal.fire('Erro', 'Não foi possível editar o item', 'error');
        }
    }
}

// ==================== GRÁFICOS DO DASHBOARD ====================

// GRÁFICO 1: ALUNOS POR TURMA (BARRAS)
function renderStudentChart() {
    const ctx = document.getElementById('studentChart');
    if (!ctx) return;
    
    // Destruir gráfico existente
    if (studentChartInstance) {
        studentChartInstance.destroy();
        studentChartInstance = null;
    }
    
    // Verificar se há alunos
    if (Object.keys(allAlunos).length === 0) {
        studentChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Sem alunos cadastrados'],
                datasets: [{
                    label: 'Alunos',
                    data: [0],
                    backgroundColor: 'rgba(148, 163, 184, 0.3)',
                    borderColor: 'rgba(148, 163, 184, 0.5)',
                    borderWidth: 2,
                    borderRadius: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return '0 alunos';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#94a3b8',
                        },
                        grid: {
                            color: 'rgba(148, 163, 184, 0.1)',
                        }
                    },
                    x: {
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#94a3b8',
                        },
                        grid: { display: false }
                    }
                },
                animation: {
                    duration: 800,
                    easing: 'easeInOutQuart'
                }
            }
        });
        return;
    }
    
    // Coletar dados por turma
    const turmasMap = {};
    Object.values(allAlunos).forEach(aluno => {
        const turma = aluno.turma || 'Sem turma';
        if (turmasMap[turma]) {
            turmasMap[turma]++;
        } else {
            turmasMap[turma] = 1;
        }
    });
    
    // Ordenar por quantidade (decrescente)
    const sorted = Object.entries(turmasMap).sort((a, b) => b[1] - a[1]);
    const turmas = sorted.map(item => item[0]);
    const quantidades = sorted.map(item => item[1]);
    
    // Cores para as barras
    const cores = [
        'rgba(99, 102, 241, 0.8)',
        'rgba(139, 92, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(14, 165, 233, 0.8)',
        'rgba(168, 85, 247, 0.8)',
        'rgba(20, 184, 166, 0.8)',
        'rgba(249, 115, 22, 0.8)',
        'rgba(6, 182, 212, 0.8)',
        'rgba(234, 179, 8, 0.8)'
    ];
    
    // Criar gráfico
    studentChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: turmas,
            datasets: [{
                label: 'Quantidade de Alunos',
                data: quantidades,
                backgroundColor: turmas.map((_, i) => cores[i % cores.length]),
                borderColor: turmas.map((_, i) => cores[i % cores.length].replace('0.8', '1')),
                borderWidth: 2,
                borderRadius: 8,
                maxBarThickness: 50,
                hoverBackgroundColor: turmas.map((_, i) => cores[i % cores.length].replace('0.8', '0.9')),
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + ' alunos';
                        },
                        afterLabel: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed.y / total) * 100).toFixed(1);
                            return percentage + '% do total';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#94a3b8',
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)',
                        drawBorder: false,
                    }
                },
                x: {
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#94a3b8',
                        maxRotation: 45,
                        minRotation: 30,
                        font: {
                            size: 10
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            },
            animation: {
                duration: 800,
                easing: 'easeInOutQuart'
            },
            layout: {
                padding: {
                    top: 10,
                    bottom: 10
                }
            }
        }
    });
}

// GRÁFICO 2: PROFESSORES POR DISCIPLINA (DOUGHNUT)
function renderTeacherChart() {
    const ctx = document.getElementById('teacherChart');
    if (!ctx) return;
    
    // Destruir gráfico existente
    if (teacherChartInstance) {
        teacherChartInstance.destroy();
        teacherChartInstance = null;
    }
    
    // Verificar se há professores
    if (Object.keys(allProfessores).length === 0) {
        teacherChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sem professores cadastrados'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(148, 163, 184, 0.3)'],
                    borderColor: ['rgba(148, 163, 184, 0.5)'],
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#94a3b8',
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return '0 professores';
                            }
                        }
                    }
                },
                cutout: '55%'
            }
        });
        return;
    }
    
    // Coletar dados por disciplina
    const disciplinaMap = {};
    Object.values(allProfessores).forEach(prof => {
        const disciplina = prof.disciplinaNome || 'Sem disciplina';
        if (disciplinaMap[disciplina]) {
            disciplinaMap[disciplina]++;
        } else {
            disciplinaMap[disciplina] = 1;
        }
    });
    
    // Ordenar por quantidade (decrescente)
    const sorted = Object.entries(disciplinaMap).sort((a, b) => b[1] - a[1]);
    const disciplinas = sorted.map(item => item[0]);
    const quantidades = sorted.map(item => item[1]);
    
    // Cores para o gráfico de pizza
    const cores = [
        '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', 
        '#ef4444', '#ec4899', '#0ea5e9', '#a855f7',
        '#14b8a6', '#f97316', '#06b6d4', '#eab308',
        '#84cc16', '#22d3ee', '#f472b6', '#fb923c'
    ];
    
    // Criar gráfico
    teacherChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: disciplinas,
            datasets: [{
                data: quantidades,
                backgroundColor: disciplinas.map((_, i) => cores[i % cores.length]),
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card-bg') || '#1e293b',
                borderWidth: 3,
                hoverOffset: 12,
                hoverBorderWidth: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#94a3b8',
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: {
                            size: 11
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: label,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                strokeStyle: data.datasets[0].backgroundColor[i],
                                pointStyle: 'circle',
                                index: i,
                                hidden: false
                            }));
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return context.label + ': ' + context.parsed + ' professor(es) (' + percentage + '%)';
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                duration: 1000,
                easing: 'easeInOutQuart'
            },
            cutout: '58%',
            layout: {
                padding: {
                    top: 10,
                    bottom: 10,
                    left: 10,
                    right: 10
                }
            }
        }
    });
}

// GRÁFICO 3: EVOLUÇÃO DE MATRÍCULAS (LINHA)
function renderEvolutionChart() {
    const ctx = document.getElementById('evolutionChart');
    if (!ctx) return;
    
    // Destruir gráfico existente
    if (evolutionChartInstance) {
        evolutionChartInstance.destroy();
        evolutionChartInstance = null;
    }
    
    // Gerar dados dos últimos 6 meses
    const meses = [];
    const datas = [];
    const hoje = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const mes = data.toLocaleString('pt-BR', { month: 'short' });
        const ano = data.getFullYear();
        const label = mes.charAt(0).toUpperCase() + mes.slice(1) + '/' + ano.toString().slice(2);
        meses.push(label);
        datas.push(data);
    }
    
    // Contar alunos criados em cada mês
    const contagem = meses.map((_, index) => {
        const dataInicio = new Date(datas[index]);
        const dataFim = new Date(dataInicio);
        dataFim.setMonth(dataFim.getMonth() + 1);
        
        return Object.values(allAlunos).filter(aluno => {
            if (!aluno.createdAt) return false;
            try {
                const criadoEm = new Date(aluno.createdAt);
                return criadoEm >= dataInicio && criadoEm < dataFim;
            } catch (e) {
                return false;
            }
        }).length;
    });
    
    // Criar gráfico
    evolutionChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: meses,
            datasets: [{
                label: 'Novos Alunos',
                data: contagem,
                borderColor: '#10b981',
                backgroundColor: function(context) {
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    if (!chartArea) return null;
                    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.05)');
                    gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.2)');
                    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.4)');
                    return gradient;
                },
                fill: true,
                tension: 0.4,
                pointBackgroundColor: function(context) {
                    const value = context.parsed.y;
                    if (value === 0) return '#94a3b8';
                    return '#10b981';
                },
                pointBorderColor: function(context) {
                    const value = context.parsed.y;
                    if (value === 0) return '#94a3b8';
                    return '#ffffff';
                },
                pointBorderWidth: 2,
                pointRadius: function(context) {
                    const value = context.parsed.y;
                    if (value === 0) return 3;
                    return 6;
                },
                pointHoverRadius: function(context) {
                    const value = context.parsed.y;
                    if (value === 0) return 5;
                    return 9;
                },
                borderWidth: 3,
                spanGaps: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + ' alunos matriculados';
                        },
                        afterBody: function(context) {
                            const total = context[0].dataset.data.reduce((a, b) => a + b, 0);
                            if (total === 0) return '';
                            return 'Total: ' + total + ' alunos';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#94a3b8',
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)',
                        drawBorder: false,
                    }
                },
                x: {
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#94a3b8',
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: {
                    top: 10,
                    bottom: 10,
                    left: 5,
                    right: 5
                }
            }
        }
    });
}

// FUNÇÃO PARA ATUALIZAR TODOS OS GRÁFICOS
function renderAllCharts() {
    renderStudentChart();
    renderTeacherChart();
    renderEvolutionChart();
}

// ==================== ATUALIZAR DASHBOARD ====================
function updateDashboard() {
    const statsDiv = document.getElementById('dashboardStats');
    if (!statsDiv) return;
    
    const totalAlunos = Object.keys(allAlunos).length;
    const ativos = Object.values(allAlunos).filter(a => a.status === 'Ativo').length;
    const inativos = totalAlunos - ativos;
    
    const totalProfessores = Object.keys(allProfessores).length;
    const totalCoordenadores = Object.keys(allCoordenadores).length;
    const totalTurmas = Object.keys(allTurmas).length;
    
    // Calcular receita do mês
    let receitaMes = 0;
    let pendentes = 0;
    const mesAtual = new Date().toISOString().slice(0, 7);
    Object.values(allFinanceiro).forEach(f => {
        if (f.mesReferencia === mesAtual) {
            if (f.status === 'Paga') receitaMes += f.valor || 0;
            else pendentes++;
        }
    });
    
    statsDiv.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon"><i class="fa-solid fa-user-graduate"></i></div>
            <h3>${totalAlunos}</h3>
            <p>Total de Alunos</p>
            <small class="text-success"><i class="fa-solid fa-arrow-up"></i> ${ativos} ativos</small>
        </div>
        <div class="stat-card">
            <div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div>
            <h3>${totalProfessores}</h3>
            <p>Professores</p>
            <small class="text-muted">${totalCoordenadores} coordenadores</small>
        </div>
        <div class="stat-card">
            <div class="stat-icon"><i class="fa-solid fa-money-bill-wave"></i></div>
            <h3>${receitaMes.toLocaleString()} KZ</h3>
            <p>Receita do Mês</p>
            <small class="text-success"><i class="fa-solid fa-arrow-up"></i> ${pendentes} pendentes</small>
        </div>
        <div class="stat-card">
            <div class="stat-icon"><i class="fa-solid fa-people-group"></i></div>
            <h3>${totalTurmas}</h3>
            <p>Turmas</p>
            <small class="text-muted">${Math.round(totalAlunos / (totalTurmas || 1))} alunos/turma</small>
        </div>
    `;
}

// ==================== RENDERIZAR ALUNOS ====================
function renderAlunos() {
    const container = document.getElementById('alunoList');
    if (!container) return;
    
    let filtered = Object.entries(allAlunos);
    const search = document.getElementById('alunoSearch')?.value.toLowerCase() || '';
    if (search) {
        filtered = filtered.filter(([_, a]) => {
            const nome = (a.nome || '').toLowerCase();
            const matricula = (a.matricula || '').toLowerCase();
            return nome.includes(search) || matricula.includes(search);
        });
    }
    
    const turmaFilter = document.getElementById('alunoFilterTurma')?.value || '';
    if (turmaFilter) {
        filtered = filtered.filter(([_, a]) => a.turma === turmaFilter);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-graduate"></i><p>Nenhum aluno encontrado</p></div>';
        return;
    }
    
    container.innerHTML = filtered.map(([id, a]) => `
        <div class="data-card">
            <div class="card-header-data">
                <div class="card-title-data">
                    <div>
                        <strong>${escapeHtml(a.nome)}</strong>
                        <br>
                        <small>Matrícula: ${a.matricula || 'N/A'}</small>
                    </div>
                </div>
                <span class="card-badge ${a.status === 'Ativo' ? 'status-ativo' : 'status-inativo'}">
                    ${a.status || 'Ativo'}
                </span>
            </div>
            <div class="card-content">
                <div class="card-info-row">
                    <i class="fa-solid fa-chalkboard"></i>
                    <span><strong>Turma:</strong> ${a.turma || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-solid fa-layer-group"></i>
                    <span><strong>Classe:</strong> ${a.classe || 'N/A'}</span>
                </div>
                ${a.curso ? `<div class="card-info-row"><i class="fa-solid fa-graduation-cap"></i><span><strong>Curso:</strong> ${a.curso}</span></div>` : ''}
                <div class="card-info-row">
                    <i class="fa-solid fa-calendar"></i>
                    <span><strong>Nascimento:</strong> ${a.dataNascimento || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-solid fa-id-card"></i>
                    <span><strong>BI:</strong> ${a.bi || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-solid fa-phone"></i>
                    <span><strong>Encarregado Tel:</strong> ${a.telefoneEncarregado || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-solid fa-user"></i>
                    <span><strong>Encarregado:</strong> ${a.nomeEncarregado || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-solid fa-location-dot"></i>
                    <span><strong>Morada:</strong> ${escapeHtml(a.endereco || 'N/A')}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-icon" data-action="editAluno" data-id="${id}">
                    <i class="fa-regular fa-pen-to-square"></i> Editar
                </button>
                <button class="btn-icon danger" data-action="delete" data-type="Aluno" data-id="${id}" data-path="alunos">
                    <i class="fa-regular fa-trash-can"></i> Excluir
                </button>
            </div>
        </div>
    `).join('');
}

// ==================== RENDERIZAR PROFESSORES ====================
function renderProfessores() {
    const container = document.getElementById('profList');
    if (!container) return;
    
    let items = Object.entries(allProfessores);
    
    const search = document.getElementById('profSearch')?.value.toLowerCase() || '';
    if (search) {
        items = items.filter(([_, p]) => {
            const nome = (p.nome || '').toLowerCase();
            const disciplina = (p.disciplinaNome || '').toLowerCase();
            const turma = (p.turmaNome || '').toLowerCase();
            return nome.includes(search) || disciplina.includes(search) || turma.includes(search);
        });
    }
    
    const disciplinaFilter = document.getElementById('profFilterDisciplina')?.value || '';
    if (disciplinaFilter) {
        items = items.filter(([_, p]) => p.disciplinaNome === disciplinaFilter);
    }
    
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-chalkboard-user"></i><p>Nenhum professor encontrado</p></div>';
        return;
    }
    
    container.innerHTML = items.map(([id, p]) => `
        <div class="data-card">
            <div class="card-header-data">
                <div class="card-title-data">
                    <div>
                        <strong>${escapeHtml(p.nome)}</strong>
                        <br>
                        <small>ID: ${p.idProfessor || 'N/A'}</small>
                    </div>
                </div>
                <div>
                    <span class="card-badge ${p.tipoVinculo === 'substituto' ? 'substituto' : ''}">
                        ${p.tipoVinculo === 'titular' ? 'Titular' : 'Substituto'}
                    </span>
                    <span class="card-badge">${p.nivel === 'primario' ? 'Primário' : 'Médio'}</span>
                </div>
            </div>
            <div class="card-content">
                <div class="card-info-row">
                    <i class="fa-solid fa-book"></i>
                    <span><strong>Disciplina:</strong> ${p.disciplinaNome || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-solid fa-chalkboard"></i>
                    <span><strong>Turma:</strong> ${p.turmaNome || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-solid fa-layer-group"></i>
                    <span><strong>Classe:</strong> ${p.classe || 'N/A'}</span>
                </div>
                ${p.curso ? `<div class="card-info-row"><i class="fa-solid fa-graduation-cap"></i><span><strong>Curso:</strong> ${p.curso}</span></div>` : ''}
                <div class="card-info-row">
                    <i class="fa-solid fa-id-card"></i>
                    <span><strong>BI:</strong> ${p.bi || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-solid fa-phone"></i>
                    <span><strong>Telefone:</strong> ${p.telefone || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-regular fa-envelope"></i>
                    <span><strong>Email:</strong> ${escapeHtml(p.email || 'N/A')}</span>
                </div>
                ${p.observacoes ? `<div class="card-info-row"><i class="fa-solid fa-note-sticky"></i><span><strong>Obs:</strong> ${escapeHtml(p.observacoes)}</span></div>` : ''}
            </div>
            <div class="card-actions">
                <button class="btn-icon" data-action="editProf" data-id="${id}">
                    <i class="fa-regular fa-pen-to-square"></i> Editar
                </button>
                <button class="btn-icon danger" data-action="delete" data-type="Professor" data-id="${id}" data-path="professores">
                    <i class="fa-regular fa-trash-can"></i> Excluir
                </button>
            </div>
        </div>
    `).join('');
}

// ==================== RENDERIZAR COORDENADORES ====================
function renderCoordenadores() {
    const container = document.getElementById('coordList');
    if (!container) return;
    const items = Object.entries(allCoordenadores);
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-tie"></i><p>Nenhum coordenador encontrado</p></div>';
        return;
    }
    container.innerHTML = items.map(([id, c]) => `
        <div class="data-card">
            <div class="card-header-data">
                <div class="card-title-data">
                    <strong>${escapeHtml(c.nome)}</strong>
                    <br><small>ID: ${c.idCoordenador || 'N/A'}</small>
                </div>
                <span class="card-badge">${c.tipoCoordenacao === 'curso' ? 'Coord. Curso' : 'Coord. Turma'}</span>
            </div>
            <div class="card-content">
                <div class="card-info-row">
                    <i class="fa-solid fa-${c.tipoCoordenacao === 'curso' ? 'graduation-cap' : 'people-group'}"></i>
                    <span>Principal: ${c.itemPrincipal || 'N/A'}</span>
                </div>
                ${c.itensAdicionais && c.itensAdicionais.length ? `<div class="card-info-row"><i class="fa-solid fa-plus"></i><span>Adicionais: ${c.itensAdicionais.join(', ')}</span></div>` : ''}
                <div class="card-info-row">
                    <i class="fa-solid fa-phone"></i>
                    <span>Telefone: ${c.telefone || 'N/A'}</span>
                </div>
                <div class="card-info-row">
                    <i class="fa-regular fa-envelope"></i>
                    <span>Email: ${escapeHtml(c.email || 'N/A')}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-icon danger" data-action="delete" data-type="Coordenador" data-id="${id}" data-path="coordenadores">
                    <i class="fa-regular fa-trash-can"></i> Excluir
                </button>
            </div>
        </div>
    `).join('');
}

// ==================== RENDERIZAR CURSOS ====================
function renderCursos() {
    const container = document.getElementById('cursoList');
    if (!container) return;
    const items = Object.entries(allCursos);
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-graduation-cap"></i><p>Nenhum curso encontrado</p></div>';
        return;
    }
    container.innerHTML = items.map(([id, c]) => `
        <div class="data-card">
            <div class="card-header-data">
                <div class="card-title-data">
                    <strong>${escapeHtml(c.nome)}</strong>
                </div>
            </div>
            <div class="card-content">
                <div class="card-info-row"><i class="fa-regular fa-clock"></i><span>Duração: ${c.duracao || 4} anos</span></div>
                ${c.descricao ? `<div class="card-info-row"><i class="fa-regular fa-file-lines"></i><span>${escapeHtml(c.descricao)}</span></div>` : ''}
            </div>
            <div class="card-actions">
                <button class="btn-icon danger" data-action="delete" data-type="Curso" data-id="${id}" data-path="cursos">
                    <i class="fa-regular fa-trash-can"></i> Excluir
                </button>
            </div>
        </div>
    `).join('');
}

// ==================== RENDERIZAR TURMAS ====================
function renderTurmas() {
    const container = document.getElementById('turmaList');
    if (!container) return;
    const items = Object.entries(allTurmas);
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-people-group"></i><p>Nenhuma turma encontrada</p></div>';
        return;
    }
    container.innerHTML = items.map(([id, t]) => `
        <div class="data-card">
            <div class="card-header-data">
                <div class="card-title-data">
                    <strong>${escapeHtml(t.nomeCompleto || t.nome)}</strong>
                </div>
                <span class="card-badge">${t.nivel === 'primario' ? 'Primário' : 'Médio'}</span>
            </div>
            <div class="card-content">
                <div class="card-info-row"><i class="fa-solid fa-layer-group"></i><span>Classe: ${t.classe}</span></div>
                ${t.curso ? `<div class="card-info-row"><i class="fa-solid fa-graduation-cap"></i><span>Curso: ${t.curso}</span></div>` : ''}
                <div class="card-info-row"><i class="fa-solid fa-door-open"></i><span>Sala: ${t.sala || 'N/A'}</span></div>
                <div class="card-info-row"><i class="fa-solid fa-users"></i><span>Capacidade: ${t.capacidade || 40}</span></div>
            </div>
            <div class="card-actions">
                <button class="btn-icon danger" data-action="delete" data-type="Turma" data-id="${id}" data-path="turmas">
                    <i class="fa-regular fa-trash-can"></i> Excluir
                </button>
            </div>
        </div>
    `).join('');
}

// ==================== RENDERIZAR DISCIPLINAS ====================
function renderDisciplinas() {
    const container = document.getElementById('disciplinaList');
    if (!container) return;
    const items = Object.entries(allDisciplinas);
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-book-open"></i><p>Nenhuma disciplina encontrada</p></div>';
        return;
    }
    container.innerHTML = items.map(([id, d]) => `
        <div class="data-card">
            <div class="card-header-data">
                <div class="card-title-data">
                    <strong>${escapeHtml(d.nome)}</strong>
                </div>
                <span class="card-badge">${d.tipoDisciplina === 'global' ? 'Global' : (d.tipoDisciplina === 'primario' ? 'Primário' : 'Médio')}</span>
            </div>
            <div class="card-content">
                <div class="card-info-row"><i class="fa-regular fa-clock"></i><span>Carga: ${d.cargaHoraria || 60}h</span></div>
                ${d.classe ? `<div class="card-info-row"><i class="fa-solid fa-layer-group"></i><span>Classe: ${d.classe}</span></div>` : ''}
                ${d.curso ? `<div class="card-info-row"><i class="fa-solid fa-graduation-cap"></i><span>Curso: ${d.curso}</span></div>` : ''}
            </div>
            <div class="card-actions">
                <button class="btn-icon danger" data-action="delete" data-type="Disciplina" data-id="${id}" data-path="disciplinas">
                    <i class="fa-regular fa-trash-can"></i> Excluir
                </button>
            </div>
        </div>
    `).join('');
}

// ==================== RENDERIZAR FINANCEIRO ====================
function renderFinanceiro() {
    const container = document.getElementById('financeiroList');
    if (!container) return;
    
    let filtered = Object.entries(allFinanceiro);
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    if (statusFilter) {
        filtered = filtered.filter(([_, m]) => m.status === statusFilter);
    }
    
    const search = document.getElementById('financeiroSearch')?.value.toLowerCase() || '';
    if (search) {
        filtered = filtered.filter(([_, m]) => {
            const nome = (m.alunoNome || '').toLowerCase();
            return nome.includes(search);
        });
    }
    
    let totalRecebido = 0;
    let totalPendente = 0;
    let totalMensalidades = filtered.length;
    
    // Ordenar por data (mais recente primeiro)
    filtered.sort((a, b) => {
        return new Date(b[1].dataVencimento || b[1].createdAt) - new Date(a[1].dataVencimento || a[1].createdAt);
    });
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-coins"></i><p>Nenhuma mensalidade encontrada</p></div>';
    } else {
        container.innerHTML = filtered.map(([id, m]) => {
            if (m.status === 'Paga') totalRecebido += m.valor || 0;
            else totalPendente++;
            
            const vencimento = m.dataVencimento || 'N/A';
            const mesReferencia = m.mesReferencia || 'N/A';
            const valor = m.valor || 0;
            
            return `
                <div class="data-card">
                    <div class="card-header-data">
                        <div class="card-title-data">
                            <strong>${escapeHtml(m.alunoNome || 'N/A')}</strong>
                        </div>
                        <span class="card-badge ${m.status === 'Paga' ? 'status-pago' : 'status-pendente'}">
                            ${m.status || 'Pendente'}
                        </span>
                    </div>
                    <div class="card-content">
                        <div class="card-info-row"><i class="fa-solid fa-money-bill"></i><span>Valor: ${valor.toLocaleString()} KZ</span></div>
                        <div class="card-info-row"><i class="fa-regular fa-calendar"></i><span>Vencimento: ${vencimento}</span></div>
                        <div class="card-info-row"><i class="fa-regular fa-calendar-alt"></i><span>Mês Ref: ${mesReferencia}</span></div>
                        ${m.dataPagamento ? `<div class="card-info-row"><i class="fa-solid fa-check-circle" style="color: #10b981;"></i><span>Pago em: ${m.dataPagamento}</span></div>` : ''}
                    </div>
                    <div class="card-actions">
                        ${m.status !== 'Paga' ? `<button class="btn-icon success" data-action="pay" data-id="${id}"><i class="fa-solid fa-check-circle"></i> Pagar</button>` : ''}
                        <button class="btn-icon danger" data-action="delete" data-type="Financeiro" data-id="${id}" data-path="financeiro">
                            <i class="fa-regular fa-trash-can"></i> Excluir
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Atualizar stats do financeiro
    const statsDiv = document.getElementById('financeiroStats');
    if (statsDiv) {
        statsDiv.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon"><i class="fa-solid fa-circle-check" style="color: #10b981;"></i></div>
                <h3>${totalRecebido.toLocaleString()} KZ</h3>
                <p>Total Recebido</p>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fa-solid fa-hourglass-half" style="color: #f59e0b;"></i></div>
                <h3>${totalPendente}</h3>
                <p>Pendentes</p>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fa-solid fa-list"></i></div>
                <h3>${totalMensalidades}</h3>
                <p>Total de Mensalidades</p>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fa-solid fa-percentage"></i></div>
                <h3>${totalMensalidades > 0 ? Math.round((totalRecebido / (totalMensalidades * 25000)) * 100) : 0}%</h3>
                <p>Taxa de Arrecadação</p>
            </div>
        `;
    }
}

// ==================== RENDERIZAR ATIVIDADES ====================
function renderAtividades() {
    const container = document.getElementById('atividadeList');
    if (!container) return;
    
    // Aplicar filtros
    const search = document.getElementById('atividadeSearch')?.value.toLowerCase() || '';
    const tipoFiltro = document.getElementById('atividadeFilterTipo')?.value || '';
    const dataFiltro = document.getElementById('atividadeFilterData')?.value || '';
    
    let items = Object.entries(allAtividades);
    
    if (search) {
        items = items.filter(([_, atv]) => {
            const acao = (atv.acao || '').toLowerCase();
            const detalhes = (atv.detalhes || '').toLowerCase();
            const usuario = (atv.usuario || '').toLowerCase();
            return acao.includes(search) || detalhes.includes(search) || usuario.includes(search);
        });
    }
    
    if (tipoFiltro) {
        items = items.filter(([_, atv]) => atv.tipo === tipoFiltro);
    }
    
    if (dataFiltro) {
        items = items.filter(([_, atv]) => {
            try {
                const dataAtv = new Date(atv.dataHora).toISOString().split('T')[0];
                return dataAtv === dataFiltro;
            } catch (e) {
                return false;
            }
        });
    }
    
    // Ordenar por data (mais recente primeiro)
    items.sort((a, b) => {
        try {
            return new Date(b[1].dataHora) - new Date(a[1].dataHora);
        } catch (e) {
            return 0;
        }
    });
    
    atividadesFiltradas = items;
    
    // Atualizar contador
    const countElement = document.getElementById('atividadeCount');
    if (countElement) {
        countElement.textContent = `${items.length} atividade${items.length !== 1 ? 's' : ''} encontrada${items.length !== 1 ? 's' : ''}`;
    }
    
    // Paginação
    const totalPaginas = Math.ceil(items.length / ITEMS_POR_PAGINA);
    const inicio = (paginaAtual - 1) * ITEMS_POR_PAGINA;
    const fim = Math.min(inicio + ITEMS_POR_PAGINA, items.length);
    const pageItems = items.slice(inicio, fim);
    
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Página ${paginaAtual} de ${totalPaginas || 1}`;
    }
    
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');
    if (btnPrev) btnPrev.disabled = paginaAtual <= 1;
    if (btnNext) btnNext.disabled = paginaAtual >= totalPaginas || totalPaginas === 0;
    
    // Renderizar
    if (pageItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-clock"></i>
                <p>Nenhuma atividade registrada ainda</p>
                <small class="text-muted">As atividades começam a ser registradas quando você interage com o sistema</small>
            </div>
        `;
        return;
    }
    
    // Ícones por tipo
    const icones = {
        'login': 'fa-solid fa-right-to-bracket',
        'cadastro': 'fa-solid fa-user-plus',
        'edicao': 'fa-solid fa-pen-to-square',
        'exclusao': 'fa-solid fa-trash-can',
        'pagamento': 'fa-solid fa-money-bill-wave',
        'configuracao': 'fa-solid fa-gear'
    };
    
    const titulos = {
        'login': 'Login realizado',
        'cadastro': 'Cadastro realizado',
        'edicao': 'Edição realizada',
        'exclusao': 'Exclusão realizada',
        'pagamento': 'Pagamento registrado',
        'configuracao': 'Configuração alterada'
    };
    
    container.innerHTML = pageItems.map(([id, atv]) => {
        const icone = icones[atv.tipo] || 'fa-solid fa-circle-info';
        const titulo = titulos[atv.tipo] || atv.tipo || 'Atividade';
        
        let dataFormatada = 'N/A';
        let horaFormatada = 'N/A';
        try {
            const dataHora = new Date(atv.dataHora);
            dataFormatada = dataHora.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            horaFormatada = dataHora.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            // Erro ao formatar data
        }
        
        return `
            <div class="atividade-item tipo-${atv.tipo || 'outro'}">
                <div class="atividade-icon tipo-${atv.tipo || 'outro'}">
                    <i class="${icone}"></i>
                </div>
                <div class="atividade-content">
                    <div class="atividade-titulo">
                        ${titulo}
                        <span class="card-badge ms-2">${atv.tipo || 'outro'}</span>
                    </div>
                    <div class="atividade-detalhes">
                        <strong>${escapeHtml(atv.acao || '')}</strong>
                        ${atv.detalhes ? `<br><span class="text-muted">${escapeHtml(atv.detalhes)}</span>` : ''}
                    </div>
                    <div class="atividade-meta">
                        <span><i class="fa-regular fa-user"></i> ${escapeHtml(atv.usuario || 'N/A')}</span>
                        <span><i class="fa-regular fa-calendar"></i> ${dataFormatada}</span>
                        <span><i class="fa-regular fa-clock"></i> ${horaFormatada}</span>
                        ${atv.entidade ? `<span><i class="fa-regular fa-folder"></i> ${escapeHtml(atv.entidade)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Atualizar stats
    atualizarStatsAtividades();
}

// ==================== ATUALIZAR STATS DAS ATIVIDADES ====================
function atualizarStatsAtividades() {
    const statsDiv = document.getElementById('atividadeStats');
    if (!statsDiv) return;
    
    const total = Object.keys(allAtividades).length;
    
    let hojeAtividades = 0;
    try {
        const hoje = new Date().toISOString().split('T')[0];
        hojeAtividades = Object.values(allAtividades).filter(atv => {
            try {
                return new Date(atv.dataHora).toISOString().split('T')[0] === hoje;
            } catch (e) {
                return false;
            }
        }).length;
    } catch (e) {
        // Erro ao calcular
    }
    
    // Contar por tipo
    const tipos = {};
    Object.values(allAtividades).forEach(atv => {
        const tipo = atv.tipo || 'outro';
        if (tipos[tipo]) tipos[tipo]++;
        else tipos[tipo] = 1;
    });
    
    statsDiv.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon"><i class="fa-solid fa-list-check"></i></div>
            <h3>${total}</h3>
            <p>Total de Atividades</p>
        </div>
        <div class="stat-card">
            <div class="stat-icon"><i class="fa-regular fa-calendar"></i></div>
            <h3>${hojeAtividades}</h3>
            <p>Atividades Hoje</p>
        </div>
        <div class="stat-card">
            <div class="stat-icon"><i class="fa-solid fa-user-plus"></i></div>
            <h3>${tipos.cadastro || 0}</h3>
            <p>Cadastros</p>
        </div>
        <div class="stat-card">
            <div class="stat-icon"><i class="fa-solid fa-pen-to-square"></i></div>
            <h3>${tipos.edicao || 0}</h3>
            <p>Edições</p>
        </div>
    `;
}

// ==================== POPULAR FILTROS ====================
function popularFiltros() {
    // Filtro de turmas para alunos
    const turmaSelect = document.getElementById('alunoFilterTurma');
    if (turmaSelect) {
        const options = Object.values(allTurmas).map(t => 
            `<option value="${t.nomeCompleto || t.nome}">${t.nomeCompleto || t.nome}</option>`
        ).join('');
        turmaSelect.innerHTML = `<option value="">Todas as turmas</option>${options}`;
    }
    
    // Filtro de disciplinas para professores
    const profFiltroSelect = document.getElementById('profFilterDisciplina');
    if (profFiltroSelect) {
        const disciplinasUnicas = new Set();
        Object.values(allProfessores).forEach(p => {
            if (p.disciplinaNome) disciplinasUnicas.add(p.disciplinaNome);
        });
        const options = Array.from(disciplinasUnicas).map(d => 
            `<option value="${d}">${d}</option>`
        ).join('');
        profFiltroSelect.innerHTML = `<option value="">Todas as disciplinas</option>${options}`;
    }
}

// ==================== EVENTOS DE FILTROS ====================
document.getElementById('btnLimparFiltrosAluno')?.addEventListener('click', () => {
    const search = document.getElementById('alunoSearch');
    const filter = document.getElementById('alunoFilterTurma');
    if (search) search.value = '';
    if (filter) filter.value = '';
    renderAlunos();
});

document.getElementById('btnLimparFiltrosProf')?.addEventListener('click', () => {
    const search = document.getElementById('profSearch');
    const filter = document.getElementById('profFilterDisciplina');
    if (search) search.value = '';
    if (filter) filter.value = '';
    renderProfessores();
});

document.getElementById('btnLimparFiltrosFinanceiro')?.addEventListener('click', () => {
    const search = document.getElementById('financeiroSearch');
    const filter = document.getElementById('filterStatus');
    if (search) search.value = '';
    if (filter) filter.value = '';
    renderFinanceiro();
});

document.getElementById('btnLimparFiltrosAtividade')?.addEventListener('click', () => {
    const search = document.getElementById('atividadeSearch');
    const tipo = document.getElementById('atividadeFilterTipo');
    const data = document.getElementById('atividadeFilterData');
    if (search) search.value = '';
    if (tipo) tipo.value = '';
    if (data) data.value = '';
    paginaAtual = 1;
    renderAtividades();
});

// Eventos de input para filtros
document.getElementById('alunoSearch')?.addEventListener('input', renderAlunos);
document.getElementById('alunoFilterTurma')?.addEventListener('change', renderAlunos);
document.getElementById('profSearch')?.addEventListener('input', renderProfessores);
document.getElementById('profFilterDisciplina')?.addEventListener('change', renderProfessores);
document.getElementById('filterStatus')?.addEventListener('change', renderFinanceiro);
document.getElementById('financeiroSearch')?.addEventListener('input', renderFinanceiro);
document.getElementById('atividadeSearch')?.addEventListener('input', () => {
    paginaAtual = 1;
    renderAtividades();
});
document.getElementById('atividadeFilterTipo')?.addEventListener('change', () => {
    paginaAtual = 1;
    renderAtividades();
});
document.getElementById('atividadeFilterData')?.addEventListener('change', () => {
    paginaAtual = 1;
    renderAtividades();
});

// ==================== PAGINAÇÃO DAS ATIVIDADES ====================
document.getElementById('btnPrevPage')?.addEventListener('click', () => {
    if (paginaAtual > 1) {
        paginaAtual--;
        renderAtividades();
        const list = document.getElementById('atividadeList');
        if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});

document.getElementById('btnNextPage')?.addEventListener('click', () => {
    const totalPaginas = Math.ceil(atividadesFiltradas.length / ITEMS_POR_PAGINA);
    if (paginaAtual < totalPaginas) {
        paginaAtual++;
        renderAtividades();
        const list = document.getElementById('atividadeList');
        if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});

// ==================== EXPORTAR PDF ====================
document.getElementById('btnExportPDF')?.addEventListener('click', async () => {
    try {
        // Registrar atividade de exportação
        await registrarAtividade('configuracao', 'Exportou relatório de atividades em PDF', 
            `Exportou ${Object.keys(allAtividades).length} atividades`);
        
        Swal.fire({
            title: '📄 Gerando PDF...',
            text: 'Por favor, aguarde enquanto o relatório é gerado.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        // Preparar dados para o PDF
        const atividades = Object.values(allAtividades).sort((a, b) => {
            try {
                return new Date(b.dataHora) - new Date(a.dataHora);
            } catch (e) {
                return 0;
            }
        });
        
        // Criar HTML para o PDF
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatório de Atividades</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
                    .header { margin-bottom: 20px; }
                    .header p { color: #666; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
                    th { background: #6366f1; color: white; padding: 10px; text-align: left; }
                    td { padding: 8px 10px; border-bottom: 1px solid #ddd; }
                    tr:hover { background: #f5f5f5; }
                    .tipo-badge { 
                        display: inline-block; 
                        padding: 2px 8px; 
                        border-radius: 12px; 
                        font-size: 10px; 
                        font-weight: bold;
                        color: white;
                    }
                    .tipo-login { background: #3b82f6; }
                    .tipo-cadastro { background: #10b981; }
                    .tipo-edicao { background: #f59e0b; }
                    .tipo-exclusao { background: #ef4444; }
                    .tipo-pagamento { background: #8b5cf6; }
                    .tipo-configuracao { background: #ec4899; }
                    .tipo-outro { background: #6b7280; }
                    .footer { margin-top: 30px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
                    .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
                    .stat-box { background: #f8f9fa; padding: 10px 20px; border-radius: 8px; border: 1px solid #e5e7eb; }
                    .stat-box strong { color: #6366f1; }
                    .watermark { color: #ddd; font-size: 60px; text-align: center; margin: 40px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📋 Relatório de Atividades do Sistema</h1>
                    <p><strong>Gerado em:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                    <p><strong>Administrador:</strong> ${currentUser?.nome || 'N/A'}</p>
                    <p><strong>Email:</strong> ${currentUser?.email || 'N/A'}</p>
                </div>
                
                <div class="stats">
                    <div class="stat-box"><strong>Total:</strong> ${atividades.length}</div>
                    <div class="stat-box"><strong>Login:</strong> ${atividades.filter(a => a.tipo === 'login').length}</div>
                    <div class="stat-box"><strong>Cadastros:</strong> ${atividades.filter(a => a.tipo === 'cadastro').length}</div>
                    <div class="stat-box"><strong>Edições:</strong> ${atividades.filter(a => a.tipo === 'edicao').length}</div>
                    <div class="stat-box"><strong>Exclusões:</strong> ${atividades.filter(a => a.tipo === 'exclusao').length}</div>
                    <div class="stat-box"><strong>Pagamentos:</strong> ${atividades.filter(a => a.tipo === 'pagamento').length}</div>
                    <div class="stat-box"><strong>Configurações:</strong> ${atividades.filter(a => a.tipo === 'configuracao').length}</div>
                </div>
                
                ${atividades.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th style="width: 15%;">Data/Hora</th>
                            <th style="width: 10%;">Tipo</th>
                            <th style="width: 25%;">Ação</th>
                            <th style="width: 25%;">Detalhes</th>
                            <th style="width: 15%;">Usuário</th>
                            <th style="width: 10%;">Entidade</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${atividades.slice(0, 200).map(atv => {
                            let dataHora = 'N/A';
                            try {
                                dataHora = new Date(atv.dataHora).toLocaleString('pt-BR');
                            } catch (e) {}
                            return `
                                <tr>
                                    <td>${dataHora}</td>
                                    <td><span class="tipo-badge tipo-${atv.tipo || 'outro'}">${atv.tipo || 'outro'}</span></td>
                                    <td>${(atv.acao || '').substring(0, 50)}${(atv.acao || '').length > 50 ? '...' : ''}</td>
                                    <td>${(atv.detalhes || '').substring(0, 60)}${(atv.detalhes || '').length > 60 ? '...' : ''}</td>
                                    <td>${atv.usuario || 'N/A'}</td>
                                    <td>${atv.entidade || 'N/A'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                ` : '<p style="text-align:center; color: #999; padding: 40px 0;">Nenhuma atividade registrada no sistema</p>'}
                
                ${atividades.length > 200 ? `<p style="margin-top: 10px; color: #999; font-style: italic;">* Mostrando as 200 atividades mais recentes (total: ${atividades.length})</p>` : ''}
                
                <div class="footer">
                    <p>Relatório gerado automaticamente pelo Sistema SandGest</p>
                    <p>© ${new Date().getFullYear()} - Todos os direitos reservados</p>
                    <p style="font-size: 10px; color: #ccc;">Este relatório contém informações confidenciais do sistema</p>
                </div>
            </body>
            </html>
        `;
        
        // Usar print para gerar PDF
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            Swal.fire('Erro', 'Não foi possível abrir a janela de impressão. Verifique se o pop-up está bloqueado.', 'error');
            return;
        }
        
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        setTimeout(() => {
            printWindow.print();
            Swal.close();
        }, 1500);
        
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        Swal.fire('Erro', 'Não foi possível gerar o PDF: ' + error.message, 'error');
    }
});

// ==================== EXPORTAR CSV ====================
document.getElementById('btnExportCSV')?.addEventListener('click', async () => {
    try {
        await registrarAtividade('configuracao', 'Exportou relatório de atividades em CSV', 
            `Exportou ${Object.keys(allAtividades).length} atividades`);
        
        const atividades = Object.values(allAtividades).sort((a, b) => {
            try {
                return new Date(b.dataHora) - new Date(a.dataHora);
            } catch (e) {
                return 0;
            }
        });
        
        if (atividades.length === 0) {
            Swal.fire('Aviso', 'Não há atividades para exportar', 'warning');
            return;
        }
        
        // Cabeçalhos do CSV
        const headers = ['Data/Hora', 'Tipo', 'Ação', 'Detalhes', 'Usuário', 'Email', 'Entidade', 'Navegador'];
        let csv = headers.join(',') + '\n';
        
        atividades.forEach(atv => {
            let dataHora = 'N/A';
            try {
                dataHora = new Date(atv.dataHora).toLocaleString('pt-BR');
            } catch (e) {}
            
            const row = [
                `"${dataHora}"`,
                `"${(atv.tipo || '').replace(/"/g, '""')}"`,
                `"${(atv.acao || '').replace(/"/g, '""')}"`,
                `"${(atv.detalhes || '').replace(/"/g, '""')}"`,
                `"${(atv.usuario || '').replace(/"/g, '""')}"`,
                `"${(atv.usuarioEmail || '').replace(/"/g, '""')}"`,
                `"${(atv.entidade || '').replace(/"/g, '""')}"`,
                `"${(atv.navegador || '').replace(/"/g, '""').substring(0, 50)}"`
            ];
            csv += row.join(',') + '\n';
        });
        
        // Download do CSV
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const dataStr = new Date().toISOString().split('T')[0];
        link.download = `atividades_${dataStr}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        showToast('CSV exportado com sucesso!');
    } catch (error) {
        console.error('Erro ao exportar CSV:', error);
        Swal.fire('Erro', 'Não foi possível exportar o CSV: ' + error.message, 'error');
    }
});

// ==================== CADASTRO DE PROFESSOR COM VERIFICAÇÃO DE SEGURANÇA ====================
document.getElementById('btnAddProf').addEventListener('click', async () => {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    if (Object.keys(allDisciplinas).length === 0) {
        Swal.fire('Atenção', 'Cadastre pelo menos uma disciplina antes de vincular um professor.', 'warning');
        return;
    }
    
    let stepData = {};
    
    // Passo 1: Nível de Ensino
    const step1 = await Swal.fire({
        title: '👨‍🏫 Novo Professor - Etapa 1 de 5',
        html: `
            <div class="stepper">
                <div class="step active"><div class="step-circle">1</div><div class="step-label">Nível</div></div>
                <div class="step"><div class="step-circle">2</div><div class="step-label">Curso</div></div>
                <div class="step"><div class="step-circle">3</div><div class="step-label">Classe</div></div>
                <div class="step"><div class="step-circle">4</div><div class="step-label">Turma</div></div>
                <div class="step"><div class="step-circle">5</div><div class="step-label">Disciplina</div></div>
            </div>
            <div class="text-center">
                <div class="mb-3">
                    <label class="form-label me-3">
                        <input type="radio" name="nivelProf" value="primario"> Ensino Primário (1ª à 9ª)
                    </label>
                </div>
                <div class="mb-3">
                    <label class="form-label me-3">
                        <input type="radio" name="nivelProf" value="medio"> Ensino Médio (10ª à 13ª)
                    </label>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Próximo ➜',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const nivel = document.querySelector('input[name="nivelProf"]:checked')?.value;
            if (!nivel) {
                Swal.showValidationMessage('Selecione o nível de ensino');
                return false;
            }
            return { nivel: nivel };
        }
    });
    
    if (!step1.value) return;
    stepData.nivel = step1.value.nivel;
    
    if (stepData.nivel === 'medio') {
        // ==================== ENSINO MÉDIO ====================
        
        // Passo 2: Curso
        const cursos = Object.entries(allCursos).map(([id, c]) => ({ id: c.nome, name: c.nome }));
        if (cursos.length === 0) {
            Swal.fire('Atenção', 'Nenhum curso cadastrado. Cadastre um curso primeiro.', 'warning');
            return;
        }
        
        const step2 = await Swal.fire({
            title: '📚 Etapa 2 de 5 - Selecione o Curso',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step active"><div class="step-circle">2</div><div class="step-label">Curso</div></div>
                    <div class="step"><div class="step-circle">3</div><div class="step-label">Classe</div></div>
                    <div class="step"><div class="step-circle">4</div><div class="step-label">Turma</div></div>
                    <div class="step"><div class="step-circle">5</div><div class="step-label">Disciplina</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Curso *</label>
                    <select id="cursoProf" class="form-select">
                        ${cursos.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Próximo ➜',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const curso = document.getElementById('cursoProf')?.value;
                if (!curso) {
                    Swal.showValidationMessage('Selecione um curso');
                    return false;
                }
                return { curso: curso };
            }
        });
        
        if (!step2.value) return;
        stepData.curso = step2.value.curso;
        
        // Passo 3: Classe
        const step3 = await Swal.fire({
            title: '📖 Etapa 3 de 5 - Selecione a Classe',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Curso</div></div>
                    <div class="step active"><div class="step-circle">3</div><div class="step-label">Classe</div></div>
                    <div class="step"><div class="step-circle">4</div><div class="step-label">Turma</div></div>
                    <div class="step"><div class="step-circle">5</div><div class="step-label">Disciplina</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Classe *</label>
                    <select id="classeProf" class="form-select">
                        <option value="10ª">10ª Classe</option>
                        <option value="11ª">11ª Classe</option>
                        <option value="12ª">12ª Classe</option>
                        <option value="13ª">13ª Classe</option>
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Próximo ➜',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const classe = document.getElementById('classeProf')?.value;
                if (!classe) {
                    Swal.showValidationMessage('Selecione uma classe');
                    return false;
                }
                return { classe: classe };
            }
        });
        
        if (!step3.value) return;
        stepData.classe = step3.value.classe;
        
        // Passo 4: Turma
        const turmasFiltradas = Object.values(allTurmas).filter(t => 
            t.nivel === 'medio' && t.curso === stepData.curso && t.classe === stepData.classe
        );
        
        if (turmasFiltradas.length === 0) {
            Swal.fire('Atenção', 'Nenhuma turma disponível para este curso e classe. Cadastre uma turma primeiro.', 'warning');
            return;
        }
        
        const step4 = await Swal.fire({
            title: '🏫 Etapa 4 de 5 - Selecione a Turma',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Curso</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Classe</div></div>
                    <div class="step active"><div class="step-circle">4</div><div class="step-label">Turma</div></div>
                    <div class="step"><div class="step-circle">5</div><div class="step-label">Disciplina</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Turma *</label>
                    <select id="turmaProf" class="form-select">
                        ${turmasFiltradas.map(t => `<option value="${t.id}" data-nome="${t.nomeCompleto || t.nome}">${t.nomeCompleto || t.nome}</option>`).join('')}
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Próximo ➜',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const select = document.getElementById('turmaProf');
                const turmaId = select?.value;
                const turmaNome = select?.options[select.selectedIndex]?.dataset.nome;
                if (!turmaId) {
                    Swal.showValidationMessage('Selecione uma turma');
                    return false;
                }
                return { turmaId: turmaId, turmaNome: turmaNome };
            }
        });
        
        if (!step4.value) return;
        stepData.turmaId = step4.value.turmaId;
        stepData.turmaNome = step4.value.turmaNome;
        
        // Passo 5: Dados do Professor (com profKey)
        const disciplinasFiltradas = Object.entries(allDisciplinas).filter(([id, d]) => {
            if (d.tipoDisciplina === 'global') return true;
            if (d.tipoDisciplina === 'medio' && d.curso === stepData.curso && d.classe === stepData.classe) return true;
            if (d.tipoDisciplina === 'primario' && d.classe === stepData.classe) return true;
            return false;
        });
        
        if (disciplinasFiltradas.length === 0) {
            Swal.fire('Atenção', 'Nenhuma disciplina disponível para esta turma. Cadastre disciplinas primeiro.', 'warning');
            return;
        }
        
        const step5 = await Swal.fire({
            title: '📝 Etapa 5 de 5 - Dados do Professor',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Curso</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Classe</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Turma</div></div>
                    <div class="step active"><div class="step-circle">5</div><div class="step-label">Disciplina</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Disciplina *</label>
                    <select id="disciplinaProf" class="form-select">
                        ${disciplinasFiltradas.map(([id, d]) => `<option value="${id}">${d.nome} (${d.cargaHoraria || 60}h)</option>`).join('')}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Tipo de Vínculo *</label>
                    <select id="tipoVinculo" class="form-select">
                        <option value="titular">Professor Titular</option>
                        <option value="substituto">Professor Substituto</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Observações (opcional)</label>
                    <textarea id="obsProf" class="form-control" rows="2"></textarea>
                </div>
                <hr>
                <div class="mb-3">
                    <label class="form-label">Nome Completo *</label>
                    <input id="nomeProf" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Data de Nascimento</label>
                    <input id="dataNascProf" type="date" class="form-control">
                </div>
                <div class="mb-3">
                    <label class="form-label">BI / NIF *</label>
                    <input id="biProf" class="form-control" placeholder="Número do Bilhete de Identidade">
                </div>
                <div class="mb-3">
                    <label class="form-label">Email *</label>
                    <input id="emailProf" type="email" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Telefone *</label>
                    <input id="telProf" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Morada</label>
                    <input id="moradaProf" class="form-control">
                </div>
                <hr>
                <div class="mb-3">
                    <label class="form-label">🔑 Código de Segurança do Professor *</label>
                    <input id="profKey" class="form-control" placeholder="Digite um código de segurança (mínimo 6 caracteres)" required minlength="6">
                    <small class="text-muted">Este código será usado pelo professor para confirmar ações importantes como editar ou excluir dados.</small>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '✅ Cadastrar Professor',
            cancelButtonText: 'Cancelar',
            width: '650px',
            preConfirm: () => {
                const nome = document.getElementById('nomeProf')?.value;
                if (!nome) {
                    Swal.showValidationMessage('Informe o nome do professor');
                    return false;
                }
                
                const email = document.getElementById('emailProf')?.value;
                if (!email) {
                    Swal.showValidationMessage('Informe o email do professor');
                    return false;
                }
                
                const telefone = document.getElementById('telProf')?.value;
                if (!telefone) {
                    Swal.showValidationMessage('Informe o telefone do professor');
                    return false;
                }
                
                const profKey = document.getElementById('profKey')?.value;
                if (!profKey || profKey.length < 6) {
                    Swal.showValidationMessage('Informe um código de segurança com pelo menos 6 caracteres');
                    return false;
                }
                
                const disciplinaId = document.getElementById('disciplinaProf')?.value;
                const disciplina = allDisciplinas[disciplinaId];
                const tipoVinculo = document.getElementById('tipoVinculo')?.value;
                
                return {
                    idProfessor: gerarIDProfessor(),
                    nome: nome,
                    dataNascimento: document.getElementById('dataNascProf')?.value || '',
                    bi: document.getElementById('biProf')?.value || '',
                    email: email,
                    telefone: telefone,
                    morada: document.getElementById('moradaProf')?.value || '',
                    nivel: stepData.nivel,
                    curso: stepData.curso,
                    classe: stepData.classe,
                    turmaId: stepData.turmaId,
                    turmaNome: stepData.turmaNome,
                    disciplinaId: disciplinaId,
                    disciplinaNome: disciplina?.nome || 'N/A',
                    tipoVinculo: tipoVinculo,
                    observacoes: document.getElementById('obsProf')?.value || '',
                    status: 'Ativo',
                    password: SENHA_PADRAO,
                    profKey: profKey,
                    uid: currentUser?.uid || 'admin'
                };
            }
        });
        
        if (step5.value) {
            try {
                const newProfRef = push(ref(db, 'professores'));
                await set(newProfRef, { ...step5.value, createdAt: serverTimestamp() });
                
                // Registrar atividade
                await registrarAtividade('cadastro', `Cadastrou novo professor: ${step5.value.nome}`, 
                    `ID: ${step5.value.idProfessor}, Disciplina: ${step5.value.disciplinaNome}, Turma: ${step5.value.turmaNome}`, 'Professor');
                
                Swal.fire({
                    title: '✅ Professor Cadastrado com Sucesso!',
                    html: `
                        <div style="text-align: left;">
                            <p><strong>👤 Nome:</strong> ${step5.value.nome}</p>
                            <p><strong>🆔 ID:</strong> <code>${step5.value.idProfessor}</code></p>
                            <p><strong>📚 Disciplina:</strong> ${step5.value.disciplinaNome}</p>
                            <p><strong>🏫 Turma:</strong> ${step5.value.turmaNome}</p>
                            <p><strong>🔗 Vínculo:</strong> ${step5.value.tipoVinculo === 'titular' ? 'Professor Titular' : 'Professor Substituto'}</p>
                            <p><strong>🔑 Código de Segurança:</strong> <code>${step5.value.profKey}</code></p>
                            <p><strong>🔑 Senha de Acesso:</strong> <code>${SENHA_PADRAO}</code></p>
                            <p style="color: #f59e0b; font-size: 0.8rem; margin-top: 8px;"><i class="fa-solid fa-triangle-exclamation"></i> Recomende que o professor troque a senha e o código de segurança no primeiro acesso.</p>
                        </div>
                    `,
                    icon: 'success'
                });
            } catch (error) {
                console.error('Erro ao cadastrar professor:', error);
                Swal.fire('Erro', 'Não foi possível cadastrar o professor', 'error');
            }
        }
    } else {
        // ==================== ENSINO PRIMÁRIO ====================
        
        // Passo 2: Classe
        const step2 = await Swal.fire({
            title: '📖 Etapa 2 de 4 - Selecione a Classe',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step active"><div class="step-circle">2</div><div class="step-label">Classe</div></div>
                    <div class="step"><div class="step-circle">3</div><div class="step-label">Turma</div></div>
                    <div class="step"><div class="step-circle">4</div><div class="step-label">Disciplina</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Classe *</label>
                    <select id="classeProfPrim" class="form-select">
                        ${Array.from({length: 9}, (_, i) => `<option value="${i+1}ª">${i+1}ª Classe</option>`).join('')}
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Próximo ➜',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const classe = document.getElementById('classeProfPrim')?.value;
                if (!classe) {
                    Swal.showValidationMessage('Selecione uma classe');
                    return false;
                }
                return { classe: classe };
            }
        });
        
        if (!step2.value) return;
        stepData.classe = step2.value.classe;
        
        // Passo 3: Turma
        const turmasFiltradas = Object.values(allTurmas).filter(t => 
            t.nivel === 'primario' && t.classe === stepData.classe
        );
        
        if (turmasFiltradas.length === 0) {
            Swal.fire('Atenção', 'Nenhuma turma disponível para esta classe. Cadastre uma turma primeiro.', 'warning');
            return;
        }
        
        const step3 = await Swal.fire({
            title: '🏫 Etapa 3 de 4 - Selecione a Turma',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Classe</div></div>
                    <div class="step active"><div class="step-circle">3</div><div class="step-label">Turma</div></div>
                    <div class="step"><div class="step-circle">4</div><div class="step-label">Disciplina</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Turma *</label>
                    <select id="turmaProfPrim" class="form-select">
                        ${turmasFiltradas.map(t => `<option value="${t.id}" data-nome="${t.nomeCompleto || t.nome}">${t.nomeCompleto || t.nome}</option>`).join('')}
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Próximo ➜',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const select = document.getElementById('turmaProfPrim');
                const turmaId = select?.value;
                const turmaNome = select?.options[select.selectedIndex]?.dataset.nome;
                if (!turmaId) {
                    Swal.showValidationMessage('Selecione uma turma');
                    return false;
                }
                return { turmaId: turmaId, turmaNome: turmaNome };
            }
        });
        
        if (!step3.value) return;
        stepData.turmaId = step3.value.turmaId;
        stepData.turmaNome = step3.value.turmaNome;
        
        // Passo 4: Dados do Professor (com profKey)
        const disciplinasFiltradas = Object.entries(allDisciplinas).filter(([id, d]) => {
            if (d.tipoDisciplina === 'global') return true;
            if (d.tipoDisciplina === 'primario' && d.classe === stepData.classe) return true;
            return false;
        });
        
        if (disciplinasFiltradas.length === 0) {
            Swal.fire('Atenção', 'Nenhuma disciplina disponível para esta turma. Cadastre disciplinas primeiro.', 'warning');
            return;
        }
        
        const step4 = await Swal.fire({
            title: '📝 Etapa 4 de 4 - Dados do Professor',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Classe</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Turma</div></div>
                    <div class="step active"><div class="step-circle">4</div><div class="step-label">Disciplina</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Disciplina *</label>
                    <select id="disciplinaProfPrim" class="form-select">
                        ${disciplinasFiltradas.map(([id, d]) => `<option value="${id}">${d.nome} (${d.cargaHoraria || 60}h)</option>`).join('')}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Tipo de Vínculo *</label>
                    <select id="tipoVinculoPrim" class="form-select">
                        <option value="titular">Professor Titular</option>
                        <option value="substituto">Professor Substituto</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Observações (opcional)</label>
                    <textarea id="obsProfPrim" class="form-control" rows="2"></textarea>
                </div>
                <hr>
                <div class="mb-3">
                    <label class="form-label">Nome Completo *</label>
                    <input id="nomeProfPrim" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Data de Nascimento</label>
                    <input id="dataNascProfPrim" type="date" class="form-control">
                </div>
                <div class="mb-3">
                    <label class="form-label">BI / NIF *</label>
                    <input id="biProfPrim" class="form-control" placeholder="Número do Bilhete de Identidade">
                </div>
                <div class="mb-3">
                    <label class="form-label">Email *</label>
                    <input id="emailProfPrim" type="email" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Telefone *</label>
                    <input id="telProfPrim" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Morada</label>
                    <input id="moradaProfPrim" class="form-control">
                </div>
                <hr>
                <div class="mb-3">
                    <label class="form-label">🔑 Código de Segurança do Professor *</label>
                    <input id="profKeyPrim" class="form-control" placeholder="Digite um código de segurança (mínimo 6 caracteres)" required minlength="6">
                    <small class="text-muted">Este código será usado pelo professor para confirmar ações importantes como editar ou excluir dados.</small>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '✅ Cadastrar Professor',
            cancelButtonText: 'Cancelar',
            width: '650px',
            preConfirm: () => {
                const nome = document.getElementById('nomeProfPrim')?.value;
                if (!nome) {
                    Swal.showValidationMessage('Informe o nome do professor');
                    return false;
                }
                
                const email = document.getElementById('emailProfPrim')?.value;
                if (!email) {
                    Swal.showValidationMessage('Informe o email do professor');
                    return false;
                }
                
                const telefone = document.getElementById('telProfPrim')?.value;
                if (!telefone) {
                    Swal.showValidationMessage('Informe o telefone do professor');
                    return false;
                }
                
                const profKey = document.getElementById('profKeyPrim')?.value;
                if (!profKey || profKey.length < 6) {
                    Swal.showValidationMessage('Informe um código de segurança com pelo menos 6 caracteres');
                    return false;
                }
                
                const disciplinaId = document.getElementById('disciplinaProfPrim')?.value;
                const disciplina = allDisciplinas[disciplinaId];
                const tipoVinculo = document.getElementById('tipoVinculoPrim')?.value;
                
                return {
                    idProfessor: gerarIDProfessor(),
                    nome: nome,
                    dataNascimento: document.getElementById('dataNascProfPrim')?.value || '',
                    bi: document.getElementById('biProfPrim')?.value || '',
                    email: email,
                    telefone: telefone,
                    morada: document.getElementById('moradaProfPrim')?.value || '',
                    nivel: stepData.nivel,
                    classe: stepData.classe,
                    turmaId: stepData.turmaId,
                    turmaNome: stepData.turmaNome,
                    disciplinaId: disciplinaId,
                    disciplinaNome: disciplina?.nome || 'N/A',
                    tipoVinculo: tipoVinculo,
                    observacoes: document.getElementById('obsProfPrim')?.value || '',
                    status: 'Ativo',
                    password: SENHA_PADRAO,
                    profKey: profKey,
                    uid: currentUser?.uid || 'admin'
                };
            }
        });
        
        if (step4.value) {
            try {
                const newProfRef = push(ref(db, 'professores'));
                await set(newProfRef, { ...step4.value, createdAt: serverTimestamp() });
                
                // Registrar atividade
                await registrarAtividade('cadastro', `Cadastrou novo professor: ${step4.value.nome}`, 
                    `ID: ${step4.value.idProfessor}, Disciplina: ${step4.value.disciplinaNome}, Turma: ${step4.value.turmaNome}`, 'Professor');
                
                Swal.fire({
                    title: '✅ Professor Cadastrado com Sucesso!',
                    html: `
                        <div style="text-align: left;">
                            <p><strong>👤 Nome:</strong> ${step4.value.nome}</p>
                            <p><strong>🆔 ID:</strong> <code>${step4.value.idProfessor}</code></p>
                            <p><strong>📚 Disciplina:</strong> ${step4.value.disciplinaNome}</p>
                            <p><strong>🏫 Turma:</strong> ${step4.value.turmaNome}</p>
                            <p><strong>🔗 Vínculo:</strong> ${step4.value.tipoVinculo === 'titular' ? 'Professor Titular' : 'Professor Substituto'}</p>
                            <p><strong>🔑 Código de Segurança:</strong> <code>${step4.value.profKey}</code></p>
                            <p><strong>🔑 Senha de Acesso:</strong> <code>${SENHA_PADRAO}</code></p>
                            <p style="color: #f59e0b; font-size: 0.8rem; margin-top: 8px;"><i class="fa-solid fa-triangle-exclamation"></i> Recomende que o professor troque a senha e o código de segurança no primeiro acesso.</p>
                        </div>
                    `,
                    icon: 'success'
                });
            } catch (error) {
                console.error('Erro ao cadastrar professor:', error);
                Swal.fire('Erro', 'Não foi possível cadastrar o professor', 'error');
            }
        }
    }
});

// ==================== CADASTRO DE ALUNO ====================
document.getElementById('btnAddAluno').addEventListener('click', async () => {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    let stepData = {};
    
    // Passo 1: Nível de Ensino
    const step1 = await Swal.fire({
        title: '👨‍🎓 Novo Aluno - Etapa 1 de 4',
        html: `
            <div class="stepper">
                <div class="step active"><div class="step-circle">1</div><div class="step-label">Nível</div></div>
                <div class="step"><div class="step-circle">2</div><div class="step-label">Curso</div></div>
                <div class="step"><div class="step-circle">3</div><div class="step-label">Classe</div></div>
                <div class="step"><div class="step-circle">4</div><div class="step-label">Turma</div></div>
            </div>
            <div class="text-center">
                <div class="mb-3">
                    <label class="form-label me-3">
                        <input type="radio" name="nivelAluno" value="primario"> Ensino Primário (1ª à 9ª)
                    </label>
                </div>
                <div class="mb-3">
                    <label class="form-label me-3">
                        <input type="radio" name="nivelAluno" value="medio"> Ensino Médio (10ª à 13ª)
                    </label>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Próximo ➜',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const nivel = document.querySelector('input[name="nivelAluno"]:checked')?.value;
            if (!nivel) {
                Swal.showValidationMessage('Selecione o nível de ensino');
                return false;
            }
            return { nivel: nivel };
        }
    });
    
    if (!step1.value) return;
    stepData.nivel = step1.value.nivel;
    
    if (stepData.nivel === 'medio') {
        // Passo 2: Curso
        const cursos = Object.entries(allCursos).map(([id, c]) => ({ id: c.nome, name: c.nome }));
        if (cursos.length === 0) {
            Swal.fire('Atenção', 'Nenhum curso cadastrado. Cadastre um curso primeiro.', 'warning');
            return;
        }
        
        const step2 = await Swal.fire({
            title: '📚 Etapa 2 de 4 - Selecione o Curso',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step active"><div class="step-circle">2</div><div class="step-label">Curso</div></div>
                    <div class="step"><div class="step-circle">3</div><div class="step-label">Classe</div></div>
                    <div class="step"><div class="step-circle">4</div><div class="step-label">Turma</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Curso *</label>
                    <select id="cursoAluno" class="form-select">
                        ${cursos.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Próximo ➜',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const curso = document.getElementById('cursoAluno')?.value;
                if (!curso) {
                    Swal.showValidationMessage('Selecione um curso');
                    return false;
                }
                return { curso: curso };
            }
        });
        
        if (!step2.value) return;
        stepData.curso = step2.value.curso;
        
        // Passo 3: Classe
        const step3 = await Swal.fire({
            title: '📖 Etapa 3 de 4 - Selecione a Classe',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Curso</div></div>
                    <div class="step active"><div class="step-circle">3</div><div class="step-label">Classe</div></div>
                    <div class="step"><div class="step-circle">4</div><div class="step-label">Turma</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Classe *</label>
                    <select id="classeAluno" class="form-select">
                        <option value="10ª">10ª Classe</option>
                        <option value="11ª">11ª Classe</option>
                        <option value="12ª">12ª Classe</option>
                        <option value="13ª">13ª Classe</option>
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Próximo ➜',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const classe = document.getElementById('classeAluno')?.value;
                if (!classe) {
                    Swal.showValidationMessage('Selecione uma classe');
                    return false;
                }
                return { classe: classe };
            }
        });
        
        if (!step3.value) return;
        stepData.classe = step3.value.classe;
        
        // Passo 4: Dados do Aluno
        const turmasFiltradas = Object.values(allTurmas).filter(t => 
            t.nivel === 'medio' && t.curso === stepData.curso && t.classe === stepData.classe
        );
        
        if (turmasFiltradas.length === 0) {
            Swal.fire('Atenção', 'Nenhuma turma disponível para este curso e classe. Cadastre uma turma primeiro.', 'warning');
            return;
        }
        
        const step4 = await Swal.fire({
            title: '📝 Etapa 4 de 4 - Dados do Aluno',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Curso</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Classe</div></div>
                    <div class="step active"><div class="step-circle">4</div><div class="step-label">Turma</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Turma *</label>
                    <select id="turmaAluno" class="form-select">
                        ${turmasFiltradas.map(t => `<option value="${t.nomeCompleto || t.nome}">${t.nomeCompleto || t.nome}</option>`).join('')}
                    </select>
                </div>
                <hr>
                <div class="mb-3">
                    <label class="form-label">Nome Completo *</label>
                    <input id="nomeAluno" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Data de Nascimento *</label>
                    <input id="dataNascAluno" type="date" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">BI / Passaporte *</label>
                    <input id="biAluno" class="form-control" placeholder="Número do Bilhete de Identidade" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Email *</label>
                    <input id="emailAluno" type="email" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Telefone do Encarregado *</label>
                    <input id="telEncarregado" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Nome do Encarregado *</label>
                    <input id="nomeEncarregado" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Morada Completa *</label>
                    <input id="enderecoAluno" class="form-control" required>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '✅ Cadastrar Aluno',
            cancelButtonText: 'Cancelar',
            width: '600px',
            preConfirm: () => {
                const nome = document.getElementById('nomeAluno')?.value;
                if (!nome) {
                    Swal.showValidationMessage('Informe o nome do aluno');
                    return false;
                }
                
                const dataNasc = document.getElementById('dataNascAluno')?.value;
                if (!dataNasc) {
                    Swal.showValidationMessage('Informe a data de nascimento');
                    return false;
                }
                
                const bi = document.getElementById('biAluno')?.value;
                if (!bi) {
                    Swal.showValidationMessage('Informe o BI do aluno');
                    return false;
                }
                
                const email = document.getElementById('emailAluno')?.value;
                if (!email) {
                    Swal.showValidationMessage('Informe o email do aluno');
                    return false;
                }
                
                const telEnc = document.getElementById('telEncarregado')?.value;
                if (!telEnc) {
                    Swal.showValidationMessage('Informe o telefone do encarregado');
                    return false;
                }
                
                const nomeEnc = document.getElementById('nomeEncarregado')?.value;
                if (!nomeEnc) {
                    Swal.showValidationMessage('Informe o nome do encarregado');
                    return false;
                }
                
                const endereco = document.getElementById('enderecoAluno')?.value;
                if (!endereco) {
                    Swal.showValidationMessage('Informe a morada do aluno');
                    return false;
                }
                
                return {
                    matricula: gerarMatricula(),
                    nome: nome,
                    dataNascimento: dataNasc,
                    bi: bi,
                    email: email,
                    telefoneEncarregado: telEnc,
                    nomeEncarregado: nomeEnc,
                    endereco: endereco,
                    nivel: stepData.nivel,
                    curso: stepData.curso,
                    classe: stepData.classe,
                    turma: document.getElementById('turmaAluno')?.value || '',
                    status: 'Ativo',
                    password: SENHA_PADRAO
                };
            }
        });
        
        if (step4.value) {
            try {
                const newAlunoRef = push(ref(db, 'alunos'));
                await set(newAlunoRef, { ...step4.value, createdAt: serverTimestamp() });
                
                // Registrar atividade
                await registrarAtividade('cadastro', `Cadastrou novo aluno: ${step4.value.nome}`, 
                    `Matrícula: ${step4.value.matricula}, Turma: ${step4.value.turma}`, 'Aluno');
                
                Swal.fire({
                    title: '✅ Aluno Cadastrado com Sucesso!',
                    html: `
                        <div style="text-align: left;">
                            <p><strong>👤 Nome:</strong> ${step4.value.nome}</p>
                            <p><strong>🎓 Matrícula:</strong> <code>${step4.value.matricula}</code></p>
                            <p><strong>🏫 Turma:</strong> ${step4.value.turma}</p>
                            <p><strong>📚 Classe:</strong> ${step4.value.classe}</p>
                            ${step4.value.curso ? `<p><strong>📖 Curso:</strong> ${step4.value.curso}</p>` : ''}
                            <p><strong>🔑 Senha:</strong> <code>${SENHA_PADRAO}</code></p>
                            <p style="color: #f59e0b; font-size: 0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> Recomende que o aluno troque a senha no primeiro acesso.</p>
                        </div>
                    `,
                    icon: 'success'
                });
            } catch (error) {
                console.error('Erro ao cadastrar aluno:', error);
                Swal.fire('Erro', 'Não foi possível cadastrar o aluno', 'error');
            }
        }
    } else {
        // ENSINO PRIMÁRIO
        // Passo 2: Classe
        const step2 = await Swal.fire({
            title: '📖 Etapa 2 de 3 - Selecione a Classe',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step active"><div class="step-circle">2</div><div class="step-label">Classe</div></div>
                    <div class="step"><div class="step-circle">3</div><div class="step-label">Turma</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Classe *</label>
                    <select id="classeAlunoPrim" class="form-select">
                        ${Array.from({length: 9}, (_, i) => `<option value="${i+1}ª">${i+1}ª Classe</option>`).join('')}
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Próximo ➜',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const classe = document.getElementById('classeAlunoPrim')?.value;
                if (!classe) {
                    Swal.showValidationMessage('Selecione uma classe');
                    return false;
                }
                return { classe: classe };
            }
        });
        
        if (!step2.value) return;
        stepData.classe = step2.value.classe;
        
        // Passo 3: Dados do Aluno
        const turmasFiltradas = Object.values(allTurmas).filter(t => 
            t.nivel === 'primario' && t.classe === stepData.classe
        );
        
        if (turmasFiltradas.length === 0) {
            Swal.fire('Atenção', 'Nenhuma turma disponível para esta classe. Cadastre uma turma primeiro.', 'warning');
            return;
        }
        
        const step3 = await Swal.fire({
            title: '📝 Etapa 3 de 3 - Dados do Aluno',
            html: `
                <div class="stepper">
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Nível</div></div>
                    <div class="step completed"><div class="step-circle">✓</div><div class="step-label">Classe</div></div>
                    <div class="step active"><div class="step-circle">3</div><div class="step-label">Turma</div></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Turma *</label>
                    <select id="turmaAlunoPrim" class="form-select">
                        ${turmasFiltradas.map(t => `<option value="${t.nomeCompleto || t.nome}">${t.nomeCompleto || t.nome}</option>`).join('')}
                    </select>
                </div>
                <hr>
                <div class="mb-3">
                    <label class="form-label">Nome Completo *</label>
                    <input id="nomeAlunoPrim" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Data de Nascimento *</label>
                    <input id="dataNascAlunoPrim" type="date" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">BI / Passaporte *</label>
                    <input id="biAlunoPrim" class="form-control" placeholder="Número do Bilhete de Identidade" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Email *</label>
                    <input id="emailAlunoPrim" type="email" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Telefone do Encarregado *</label>
                    <input id="telEncarregadoPrim" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Nome do Encarregado *</label>
                    <input id="nomeEncarregadoPrim" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Morada Completa *</label>
                    <input id="enderecoAlunoPrim" class="form-control" required>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '✅ Cadastrar Aluno',
            cancelButtonText: 'Cancelar',
            width: '600px',
            preConfirm: () => {
                const nome = document.getElementById('nomeAlunoPrim')?.value;
                if (!nome) {
                    Swal.showValidationMessage('Informe o nome do aluno');
                    return false;
                }
                
                const dataNasc = document.getElementById('dataNascAlunoPrim')?.value;
                if (!dataNasc) {
                    Swal.showValidationMessage('Informe a data de nascimento');
                    return false;
                }
                
                const bi = document.getElementById('biAlunoPrim')?.value;
                if (!bi) {
                    Swal.showValidationMessage('Informe o BI do aluno');
                    return false;
                }
                
                const email = document.getElementById('emailAlunoPrim')?.value;
                if (!email) {
                    Swal.showValidationMessage('Informe o email do aluno');
                    return false;
                }
                
                const telEnc = document.getElementById('telEncarregadoPrim')?.value;
                if (!telEnc) {
                    Swal.showValidationMessage('Informe o telefone do encarregado');
                    return false;
                }
                
                const nomeEnc = document.getElementById('nomeEncarregadoPrim')?.value;
                if (!nomeEnc) {
                    Swal.showValidationMessage('Informe o nome do encarregado');
                    return false;
                }
                
                const endereco = document.getElementById('enderecoAlunoPrim')?.value;
                if (!endereco) {
                    Swal.showValidationMessage('Informe a morada do aluno');
                    return false;
                }
                
                return {
                    matricula: gerarMatricula(),
                    nome: nome,
                    dataNascimento: dataNasc,
                    bi: bi,
                    email: email,
                    telefoneEncarregado: telEnc,
                    nomeEncarregado: nomeEnc,
                    endereco: endereco,
                    nivel: stepData.nivel,
                    classe: stepData.classe,
                    turma: document.getElementById('turmaAlunoPrim')?.value || '',
                    status: 'Ativo',
                    password: SENHA_PADRAO
                };
            }
        });
        
        if (step3.value) {
            try {
                const newAlunoRef = push(ref(db, 'alunos'));
                await set(newAlunoRef, { ...step3.value, createdAt: serverTimestamp() });
                
                // Registrar atividade
                await registrarAtividade('cadastro', `Cadastrou novo aluno: ${step3.value.nome}`, 
                    `Matrícula: ${step3.value.matricula}, Turma: ${step3.value.turma}`, 'Aluno');
                
                Swal.fire({
                    title: '✅ Aluno Cadastrado com Sucesso!',
                    html: `
                        <div style="text-align: left;">
                            <p><strong>👤 Nome:</strong> ${step3.value.nome}</p>
                            <p><strong>🎓 Matrícula:</strong> <code>${step3.value.matricula}</code></p>
                            <p><strong>🏫 Turma:</strong> ${step3.value.turma}</p>
                            <p><strong>📚 Classe:</strong> ${step3.value.classe}</p>
                            <p><strong>🔑 Senha:</strong> <code>${SENHA_PADRAO}</code></p>
                            <p style="color: #f59e0b; font-size: 0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> Recomende que o aluno troque a senha no primeiro acesso.</p>
                        </div>
                    `,
                    icon: 'success'
                });
            } catch (error) {
                console.error('Erro ao cadastrar aluno:', error);
                Swal.fire('Erro', 'Não foi possível cadastrar o aluno', 'error');
            }
        }
    }
});

// ==================== CADASTRO DE COORDENADOR ====================
document.getElementById('btnAddCoordenador').addEventListener('click', async () => {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    let tipo = '';
    
    const tipoResult = await Swal.fire({
        title: '👔 Tipo de Coordenador',
        input: 'select',
        inputOptions: {
            'curso': 'Coordenador de Curso',
            'turma': 'Coordenador de Turma'
        },
        inputPlaceholder: 'Selecione o tipo',
        showCancelButton: true,
        confirmButtonText: 'Próximo ➜',
        cancelButtonText: 'Cancelar'
    });
    
    if (!tipoResult.value) return;
    tipo = tipoResult.value;
    
    let extraHtml = '';
    
    if (tipo === 'curso') {
        const cursos = Object.entries(allCursos).map(([id, c]) => 
            `<option value="${c.nome}">${c.nome}</option>`
        ).join('');
        extraHtml = `
            <div class="mb-3">
                <label class="form-label">Curso Principal *</label>
                <select id="cursoPrincipal" class="form-select">${cursos || '<option>Nenhum curso cadastrado</option>'}</select>
            </div>
            <div class="mb-3">
                <label class="form-label">Cursos Adicionais (máximo 2)</label>
                <select id="cursosAdicionais" class="form-select" multiple size="3">
                    ${cursos}
                </select>
                <small class="text-muted">Segure Ctrl para selecionar múltiplos</small>
            </div>
        `;
    } else {
        const turmas = Object.values(allTurmas).map(t => 
            `<option value="${t.nomeCompleto || t.nome}">${t.nomeCompleto || t.nome}</option>`
        ).join('');
        extraHtml = `
            <div class="mb-3">
                <label class="form-label">Turma Principal *</label>
                <select id="turmaPrincipal" class="form-select">${turmas || '<option>Nenhuma turma cadastrada</option>'}</select>
            </div>
            <div class="mb-3">
                <label class="form-label">Turmas Adicionais (máximo 2)</label>
                <select id="turmasAdicionais" class="form-select" multiple size="3">
                    ${turmas}
                </select>
                <small class="text-muted">Segure Ctrl para selecionar múltiplos</small>
            </div>
        `;
    }
    
    const dadosResult = await Swal.fire({
        title: '📝 Dados do Coordenador',
        html: `
            <div class="mb-3">
                <label class="form-label">Nome Completo *</label>
                <input id="nomeCoord" class="form-control" required>
            </div>
            <div class="mb-3">
                <label class="form-label">Email *</label>
                <input id="emailCoord" type="email" class="form-control" required>
            </div>
            <div class="mb-3">
                <label class="form-label">Telefone *</label>
                <input id="telefoneCoord" class="form-control" required>
            </div>
            ${extraHtml}
        `,
        showCancelButton: true,
        confirmButtonText: '✅ Cadastrar Coordenador',
        cancelButtonText: 'Cancelar',
        width: '600px',
        preConfirm: () => {
            const nome = document.getElementById('nomeCoord')?.value;
            if (!nome) {
                Swal.showValidationMessage('Informe o nome do coordenador');
                return false;
            }
            
            const email = document.getElementById('emailCoord')?.value;
            if (!email) {
                Swal.showValidationMessage('Informe o email do coordenador');
                return false;
            }
            
            const telefone = document.getElementById('telefoneCoord')?.value;
            if (!telefone) {
                Swal.showValidationMessage('Informe o telefone do coordenador');
                return false;
            }
            
            let principal = '';
            let adicionais = [];
            
            if (tipo === 'curso') {
                principal = document.getElementById('cursoPrincipal')?.value || '';
                const select = document.getElementById('cursosAdicionais');
                adicionais = Array.from(select?.selectedOptions || []).map(o => o.value);
            } else {
                principal = document.getElementById('turmaPrincipal')?.value || '';
                const select = document.getElementById('turmasAdicionais');
                adicionais = Array.from(select?.selectedOptions || []).map(o => o.value);
            }
            
            return {
                idCoordenador: 'COORD' + new Date().getFullYear() + Math.floor(100 + Math.random() * 900),
                nome: nome,
                email: email,
                telefone: telefone,
                tipoCoordenacao: tipo,
                itemPrincipal: principal,
                itensAdicionais: adicionais.slice(0, 2),
                password: SENHA_PADRAO,
                status: 'Ativo'
            };
        }
    });
    
    if (dadosResult.value) {
        try {
            const newCoordRef = push(ref(db, 'coordenadores'));
            await set(newCoordRef, { ...dadosResult.value, createdAt: serverTimestamp() });
            
            // Registrar atividade
            await registrarAtividade('cadastro', `Cadastrou novo coordenador: ${dadosResult.value.nome}`, 
                `ID: ${dadosResult.value.idCoordenador}, Tipo: ${dadosResult.value.tipoCoordenacao}, Principal: ${dadosResult.value.itemPrincipal}`, 'Coordenador');
            
            Swal.fire({
                title: '✅ Coordenador Cadastrado com Sucesso!',
                html: `
                    <div style="text-align: left;">
                        <p><strong>👤 Nome:</strong> ${dadosResult.value.nome}</p>
                        <p><strong>🆔 ID:</strong> <code>${dadosResult.value.idCoordenador}</code></p>
                        <p><strong>👔 Tipo:</strong> ${dadosResult.value.tipoCoordenacao === 'curso' ? 'Coordenador de Curso' : 'Coordenador de Turma'}</p>
                        <p><strong>📌 Principal:</strong> ${dadosResult.value.itemPrincipal}</p>
                        ${dadosResult.value.itensAdicionais.length ? `<p><strong>➕ Adicionais:</strong> ${dadosResult.value.itensAdicionais.join(', ')}</p>` : ''}
                        <p><strong>🔑 Senha:</strong> <code>${SENHA_PADRAO}</code></p>
                    </div>
                `,
                icon: 'success'
            });
        } catch (error) {
            console.error('Erro ao cadastrar coordenador:', error);
            Swal.fire('Erro', 'Não foi possível cadastrar o coordenador', 'error');
        }
    }
});

// ==================== CADASTRO DE TURMA ====================
document.getElementById('btnAddTurma').addEventListener('click', async () => {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    const result = await Swal.fire({
        title: '🏫 Nova Turma',
        html: `
            <div class="mb-3">
                <label class="form-label">Nome da Turma *</label>
                <input id="nomeTurma" class="form-control" placeholder="Ex: A, B, C ou 10ª A">
            </div>
            <div class="mb-3">
                <label class="form-label">Nível de Ensino *</label>
                <select id="nivelTurma" class="form-select">
                    <option value="primario">Ensino Primário (1ª à 9ª)</option>
                    <option value="medio">Ensino Médio (10ª à 13ª)</option>
                </select>
            </div>
            <div class="mb-3" id="cursoDiv" style="display:none;">
                <label class="form-label">Curso *</label>
                <select id="cursoTurma" class="form-select">
                    ${Object.entries(allCursos).map(([id, c]) => `<option value="${c.nome}">${c.nome}</option>`).join('') || '<option>Nenhum curso cadastrado</option>'}
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label">Classe *</label>
                <select id="classeTurma" class="form-select">
                    <option value="1ª">1ª Classe</option>
                    <option value="2ª">2ª Classe</option>
                    <option value="3ª">3ª Classe</option>
                    <option value="4ª">4ª Classe</option>
                    <option value="5ª">5ª Classe</option>
                    <option value="6ª">6ª Classe</option>
                    <option value="7ª">7ª Classe</option>
                    <option value="8ª">8ª Classe</option>
                    <option value="9ª">9ª Classe</option>
                    <option value="10ª">10ª Classe</option>
                    <option value="11ª">11ª Classe</option>
                    <option value="12ª">12ª Classe</option>
                    <option value="13ª">13ª Classe</option>
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label">Sala</label>
                <input id="salaTurma" class="form-control" placeholder="Ex: Sala 101">
            </div>
            <div class="mb-3">
                <label class="form-label">Capacidade Máxima</label>
                <input id="capacidadeTurma" class="form-control" value="40" type="number">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ Cadastrar Turma',
        cancelButtonText: 'Cancelar',
        width: '600px',
        didOpen: () => {
            const nivelSelect = document.getElementById('nivelTurma');
            const cursoDiv = document.getElementById('cursoDiv');
            nivelSelect.addEventListener('change', () => {
                cursoDiv.style.display = nivelSelect.value === 'medio' ? 'block' : 'none';
            });
        },
        preConfirm: () => {
            const nome = document.getElementById('nomeTurma')?.value;
            if (!nome) {
                Swal.showValidationMessage('Informe o nome da turma');
                return false;
            }
            
            const nivel = document.getElementById('nivelTurma')?.value;
            const classe = document.getElementById('classeTurma')?.value;
            
            let turmaData = {
                nome: nome,
                nivel: nivel,
                classe: classe,
                sala: document.getElementById('salaTurma')?.value || '',
                capacidade: parseInt(document.getElementById('capacidadeTurma')?.value) || 40
            };
            
            if (nivel === 'medio') {
                const curso = document.getElementById('cursoTurma')?.value;
                if (!curso || curso === 'Nenhum curso cadastrado') {
                    Swal.showValidationMessage('Selecione um curso válido');
                    return false;
                }
                turmaData.curso = curso;
                turmaData.nomeCompleto = `${curso} - ${classe} - Turma ${nome}`;
            } else {
                turmaData.nomeCompleto = `${classe} - Turma ${nome}`;
            }
            
            return turmaData;
        }
    });
    
    if (result.value) {
        try {
            const newTurmaRef = push(ref(db, 'turmas'));
            await set(newTurmaRef, { ...result.value, id: newTurmaRef.key, createdAt: serverTimestamp() });
            
            // Registrar atividade
            await registrarAtividade('cadastro', `Cadastrou nova turma: ${result.value.nomeCompleto}`, 
                `Nível: ${result.value.nivel}, Classe: ${result.value.classe}, Sala: ${result.value.sala || 'N/A'}`, 'Turma');
            
            showToast('Turma cadastrada com sucesso!');
        } catch (error) {
            console.error('Erro ao cadastrar turma:', error);
            Swal.fire('Erro', 'Não foi possível cadastrar a turma', 'error');
        }
    }
});

// ==================== CADASTRO DE CURSO ====================
document.getElementById('btnAddCurso').addEventListener('click', async () => {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    const result = await Swal.fire({
        title: '📚 Novo Curso',
        html: `
            <div class="mb-3">
                <label class="form-label">Nome do Curso *</label>
                <input id="nomeCurso" class="form-control" required>
            </div>
            <div class="mb-3">
                <label class="form-label">Duração (anos)</label>
                <input id="duracaoCurso" class="form-control" value="4" type="number" min="1" max="6">
            </div>
            <div class="mb-3">
                <label class="form-label">Descrição</label>
                <textarea id="descCurso" class="form-control" rows="2"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ Cadastrar Curso',
        cancelButtonText: 'Cancelar',
        width: '500px',
        preConfirm: () => {
            const nome = document.getElementById('nomeCurso')?.value;
            if (!nome) {
                Swal.showValidationMessage('Informe o nome do curso');
                return false;
            }
            return {
                nome: nome,
                duracao: parseInt(document.getElementById('duracaoCurso')?.value) || 4,
                descricao: document.getElementById('descCurso')?.value || ''
            };
        }
    });
    
    if (result.value) {
        try {
            const newCursoRef = push(ref(db, 'cursos'));
            await set(newCursoRef, { ...result.value, createdAt: serverTimestamp() });
            
            // Registrar atividade
            await registrarAtividade('cadastro', `Cadastrou novo curso: ${result.value.nome}`, 
                `Duração: ${result.value.duracao} anos`, 'Curso');
            
            showToast('Curso cadastrado com sucesso!');
        } catch (error) {
            console.error('Erro ao cadastrar curso:', error);
            Swal.fire('Erro', 'Não foi possível cadastrar o curso', 'error');
        }
    }
});

// ==================== CADASTRO DE DISCIPLINA ====================
document.getElementById('btnAddDisciplina').addEventListener('click', async () => {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    let stepData = {};
    
    const step1 = await Swal.fire({
        title: '📖 Nova Disciplina - Tipo',
        html: `
            <div class="mb-3">
                <label class="form-label me-3">
                    <input type="radio" name="tipoDisc" value="global"> Global (Português, Matemática, etc)
                </label>
            </div>
            <div class="mb-3">
                <label class="form-label me-3">
                    <input type="radio" name="tipoDisc" value="primario"> Ensino Primário (por classe)
                </label>
            </div>
            <div class="mb-3">
                <label class="form-label me-3">
                    <input type="radio" name="tipoDisc" value="medio"> Ensino Médio (por curso e classe)
                </label>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Próximo ➜',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const tipo = document.querySelector('input[name="tipoDisc"]:checked')?.value;
            if (!tipo) {
                Swal.showValidationMessage('Selecione um tipo de disciplina');
                return false;
            }
            return { tipo: tipo };
        }
    });
    
    if (!step1.value) return;
    stepData.tipo = step1.value.tipo;
    
    let extraHtml = '';
    if (stepData.tipo === 'primario') {
        extraHtml = `
            <div class="mb-3">
                <label class="form-label">Classe *</label>
                <select id="classeDisc" class="form-select">
                    ${Array.from({length: 9}, (_, i) => `<option value="${i+1}ª">${i+1}ª Classe</option>`).join('')}
                </select>
            </div>
        `;
    } else if (stepData.tipo === 'medio') {
        const cursos = Object.entries(allCursos).map(([id, c]) => 
            `<option value="${c.nome}">${c.nome}</option>`
        ).join('');
        extraHtml = `
            <div class="mb-3">
                <label class="form-label">Curso *</label>
                <select id="cursoDisc" class="form-select">${cursos || '<option>Nenhum curso cadastrado</option>'}</select>
            </div>
            <div class="mb-3">
                <label class="form-label">Classe *</label>
                <select id="classeMedioDisc" class="form-select">
                    <option value="10ª">10ª Classe</option>
                    <option value="11ª">11ª Classe</option>
                    <option value="12ª">12ª Classe</option>
                    <option value="13ª">13ª Classe</option>
                </select>
            </div>
        `;
    }
    
    const step2 = await Swal.fire({
        title: '📝 Dados da Disciplina',
        html: `
            <div class="mb-3">
                <label class="form-label">Nome da Disciplina *</label>
                <input id="nomeDisc" class="form-control" required>
            </div>
            <div class="mb-3">
                <label class="form-label">Carga Horária (horas)</label>
                <input id="cargaDisc" class="form-control" value="60" type="number" min="1">
            </div>
            ${extraHtml}
        `,
        showCancelButton: true,
        confirmButtonText: '✅ Cadastrar Disciplina',
        cancelButtonText: 'Cancelar',
        width: '500px',
        preConfirm: () => {
            const nome = document.getElementById('nomeDisc')?.value;
            if (!nome) {
                Swal.showValidationMessage('Informe o nome da disciplina');
                return false;
            }
            
            const dados = {
                nome: nome,
                cargaHoraria: parseInt(document.getElementById('cargaDisc')?.value) || 60,
                tipoDisciplina: stepData.tipo
            };
            
            if (stepData.tipo === 'primario') {
                dados.classe = document.getElementById('classeDisc')?.value;
            } else if (stepData.tipo === 'medio') {
                dados.curso = document.getElementById('cursoDisc')?.value;
                dados.classe = document.getElementById('classeMedioDisc')?.value;
            }
            
            return dados;
        }
    });
    
    if (step2.value) {
        try {
            const newDiscRef = push(ref(db, 'disciplinas'));
            await set(newDiscRef, { ...step2.value, createdAt: serverTimestamp() });
            
            // Registrar atividade
            await registrarAtividade('cadastro', `Cadastrou nova disciplina: ${step2.value.nome}`, 
                `Tipo: ${step2.value.tipoDisciplina}, Carga: ${step2.value.cargaHoraria}h${step2.value.classe ? ', Classe: ' + step2.value.classe : ''}${step2.value.curso ? ', Curso: ' + step2.value.curso : ''}`, 'Disciplina');
            
            showToast('Disciplina cadastrada com sucesso!');
        } catch (error) {
            console.error('Erro ao cadastrar disciplina:', error);
            Swal.fire('Erro', 'Não foi possível cadastrar a disciplina', 'error');
        }
    }
});

// ==================== GERAR MENSALIDADES ====================
document.getElementById('btnGerarMensalidades').addEventListener('click', async () => {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    const valor = parseInt(document.getElementById('configValorMensalidade')?.value) || 25000;
    const mes = new Date().toISOString().slice(0, 7);
    const ativos = Object.values(allAlunos).filter(a => a.status === 'Ativo');
    
    if (ativos.length === 0) {
        Swal.fire('Atenção', 'Nenhum aluno ativo encontrado para gerar mensalidades', 'warning');
        return;
    }
    
    const result = await Swal.fire({
        title: '💰 Gerar Mensalidades',
        html: `
            <p>Gerar mensalidades para <strong>${ativos.length}</strong> alunos?</p>
            <p><strong>Valor:</strong> ${valor.toLocaleString()} KZ</p>
            <p><strong>Mês:</strong> ${mes.replace('-', '/')}</p>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '✅ Sim, gerar',
        cancelButtonText: 'Cancelar'
    });
    
    if (result.isConfirmed) {
        try {
            let contador = 0;
            for (let a of ativos) {
                const alunoId = Object.keys(allAlunos).find(k => allAlunos[k] === a);
                if (alunoId) {
                    await set(push(ref(db, 'financeiro')), {
                        alunoId: alunoId,
                        alunoNome: a.nome || 'N/A',
                        valor: valor,
                        dataVencimento: `${mes}-10`,
                        mesReferencia: mes,
                        status: 'Pendente',
                        createdAt: serverTimestamp()
                    });
                    contador++;
                }
            }
            
            // Registrar atividade
            await registrarAtividade('pagamento', `Gerou mensalidades para ${contador} alunos`, 
                `Valor: ${valor.toLocaleString()} KZ, Mês: ${mes.replace('-', '/')}`, 'Financeiro');
            
            Swal.fire('✅ Sucesso!', `${contador} mensalidades geradas com sucesso para ${mes.replace('-', '/')}`, 'success');
        } catch (error) {
            console.error('Erro ao gerar mensalidades:', error);
            Swal.fire('Erro', 'Não foi possível gerar as mensalidades', 'error');
        }
    }
});

// ==================== SALVAR CONFIGURAÇÕES ====================
document.getElementById('btnSaveConfig').addEventListener('click', async () => {
    const senhaValida = await verificarSenhaSegurancaAdmin();
    if (!senhaValida) {
        return;
    }
    
    const nomeEscola = document.getElementById('configNomeEscola')?.value;
    const anoLetivo = parseInt(document.getElementById('configAnoLetivo')?.value);
    const valorMensalidade = parseInt(document.getElementById('configValorMensalidade')?.value);
    
    if (!nomeEscola) {
        Swal.fire('Atenção', 'Informe o nome da escola', 'warning');
        return;
    }
    
    if (!anoLetivo || anoLetivo < 2000) {
        Swal.fire('Atenção', 'Informe um ano letivo válido', 'warning');
        return;
    }
    
    try {
        const configData = {
            nomeEscola: nomeEscola,
            anoLetivo: anoLetivo,
            valorMensalidade: valorMensalidade || 25000
        };
        
        await set(ref(db, 'config'), configData);
        
        // Registrar atividade
        await registrarAtividade('configuracao', 'Atualizou configurações do sistema', 
            `Escola: ${nomeEscola}, Ano: ${anoLetivo}, Mensalidade: ${valorMensalidade || 25000} KZ`, 'Configuração');
        
        showToast('Configurações salvas com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        Swal.fire('Erro', 'Não foi possível salvar as configurações', 'error');
    }
});

// ==================== EVENTOS GLOBAIS COM SEGURANÇA ====================
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const path = btn.dataset.path;
    const type = btn.dataset.type;
    
    if (action === 'delete' && id && path) {
        await deleteItemWithSecurity(path, id, type || 'item');
    }
    
    if (action === 'editProf' && id) {
        const p = allProfessores[id];
        if (p) {
            await editItemWithSecurity('professores', id, p);
        }
    }
    
    if (action === 'editAluno' && id) {
        const a = allAlunos[id];
        if (a) {
            await editItemWithSecurity('alunos', id, a);
        }
    }
    
    if (action === 'pay' && id) {
        const senhaValida = await verificarSenhaSegurancaAdmin();
        if (!senhaValida) {
            return;
        }
        
        const result = await Swal.fire({
            title: '💰 Registrar Pagamento',
            html: `
                <p><strong>Aluno:</strong> ${allFinanceiro[id]?.alunoNome || 'N/A'}</p>
                <p><strong>Valor:</strong> ${(allFinanceiro[id]?.valor || 0).toLocaleString()} KZ</p>
                <div class="mb-3">
                    <label class="form-label">Data do Pagamento</label>
                    <input id="dataPagamento" type="date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '✅ Confirmar Pagamento',
            cancelButtonText: 'Cancelar'
        });
        
        if (result.isConfirmed) {
            try {
                const dataPagamento = document.getElementById('dataPagamento')?.value || new Date().toISOString().split('T')[0];
                
                // Registrar atividade
                const financeiro = allFinanceiro[id];
                await registrarAtividade('pagamento', `Registrou pagamento de ${financeiro?.alunoNome || 'aluno'}`, 
                    `Valor: ${financeiro?.valor?.toLocaleString()} KZ, Mês: ${financeiro?.mesReferencia}, Data: ${dataPagamento}`, 'Financeiro');
                
                await update(ref(db, `financeiro/${id}`), {
                    status: 'Paga',
                    dataPagamento: dataPagamento,
                    updatedAt: serverTimestamp()
                });
                
                showToast('✅ Pagamento registrado com sucesso!');
            } catch (error) {
                console.error('Erro ao registrar pagamento:', error);
                Swal.fire('Erro', 'Não foi possível registrar o pagamento', 'error');
            }
        }
    }
});

// ==================== NAVEGAÇÃO ====================
document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
        a.classList.add('active');
        
        const target = a.dataset.target;
        document.querySelectorAll('[id^="screen-"]').forEach(s => s.style.display = 'none');
        const screen = document.getElementById(`screen-${target}`);
        if (screen) screen.style.display = 'block';
        
        const mobileTitle = document.getElementById('mobileTitle');
        if (mobileTitle) {
            const span = a.querySelector('span');
            mobileTitle.innerText = span ? span.innerText : target;
        }
        
        // Marcar atividades como visualizadas ao acessar a página
        if (target === 'atividades') {
            marcarAtividadesVisualizadas();
        }
        
        if (window.innerWidth < 992) {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('overlay').style.display = 'none';
        }
    });
});

// ==================== MENU MOBILE ====================
document.getElementById('menuBtn')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar) {
        sidebar.classList.toggle('open');
        if (overlay) {
            overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
        }
    }
});

document.getElementById('overlay')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar) {
        sidebar.classList.remove('open');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
});

// ==================== TEMA (DARK/LIGHT) ====================
let savedTheme = localStorage.getItem('theme') || 'dark';
document.body.setAttribute('data-theme', savedTheme);
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    themeToggle.innerHTML = `<i class="fa-solid ${savedTheme === 'dark' ? 'fa-moon' : 'fa-sun'}"></i>`;
    themeToggle.addEventListener('click', () => {
        let th = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', th);
        localStorage.setItem('theme', th);
        themeToggle.innerHTML = `<i class="fa-solid ${th === 'dark' ? 'fa-moon' : 'fa-sun'}"></i>`;
        
        // Recriar gráficos com as novas cores
        renderAllCharts();
    });
}

// ==================== DADOS DO USUÁRIO ====================
if (currentUser) {
    const adminName = document.getElementById('admin-name');
    const adminEmail = document.getElementById('admin-email');
    if (adminName) adminName.textContent = currentUser.nome || 'Administrador';
    if (adminEmail) adminEmail.textContent = currentUser.email || 'admin@escola.com';
    
    // Carregar dados do admin atual
    const adminRef = ref(db, 'Admin');
    const snapshot = await get(adminRef);
    const admins = snapshot.val() || {};
    for (let id in admins) {
        if (admins[id].email === currentUser.email) {
            currentAdminData = { id: id, ...admins[id] };
            break;
        }
    }
}

// ==================== FIREBASE LISTENERS ====================
onValue(ref(db, 'alunos'), (snap) => {
    allAlunos = snap.val() || {};
    renderAlunos();
    updateDashboard();
    popularFiltros();
    renderStudentChart();
    renderEvolutionChart();
});

onValue(ref(db, 'professores'), (snap) => {
    allProfessores = snap.val() || {};
    renderProfessores();
    updateDashboard();
    popularFiltros();
    renderTeacherChart();
    renderEvolutionChart();
});

onValue(ref(db, 'coordenadores'), (snap) => {
    allCoordenadores = snap.val() || {};
    renderCoordenadores();
    updateDashboard();
});

onValue(ref(db, 'cursos'), (snap) => {
    allCursos = snap.val() || {};
    renderCursos();
    updateDashboard();
});

onValue(ref(db, 'turmas'), (snap) => {
    allTurmas = snap.val() || {};
    renderTurmas();
    updateDashboard();
    popularFiltros();
    renderStudentChart();
});

onValue(ref(db, 'disciplinas'), (snap) => {
    allDisciplinas = snap.val() || {};
    renderDisciplinas();
});

onValue(ref(db, 'financeiro'), (snap) => {
    allFinanceiro = snap.val() || {};
    renderFinanceiro();
    updateDashboard();
});

onValue(ref(db, 'atividades'), (snap) => {
    allAtividades = snap.val() || {};
    renderAtividades();
    atualizarBadgeAtividades();
});

onValue(ref(db, 'config'), (snap) => {
    if (snap.exists()) {
        const c = snap.val();
        const nomeEscola = document.getElementById('configNomeEscola');
        const anoLetivo = document.getElementById('configAnoLetivo');
        const valorMensalidade = document.getElementById('configValorMensalidade');
        if (nomeEscola) nomeEscola.value = c.nomeEscola || '';
        if (anoLetivo) anoLetivo.value = c.anoLetivo || '';
        if (valorMensalidade) valorMensalidade.value = c.valorMensalidade || 25000;
    }
});

// ==================== INICIALIZAÇÃO ====================
// Registrar login do administrador
setTimeout(async () => {
    await registrarAtividade('login', 'Administrador fez login no sistema', 
        `Email: ${currentUser?.email || 'N/A'}`, 'Login');
}, 1000);

// Renderizar gráficos após carregar os dados
setTimeout(() => {
    renderAllCharts();
}, 1000);

console.log('✅ Sistema SandGest inicializado com sucesso!');
console.log('👤 Administrador:', currentUser?.nome || 'N/A');
console.log('📊 Gráficos:', studentChartInstance ? '✅' : '❌', teacherChartInstance ? '✅' : '❌', evolutionChartInstance ? '✅' : '❌');
console.log('📝 Atividades:', Object.keys(allAtividades).length || 0, 'registradas');
console.log('🎓 Alunos:', Object.keys(allAlunos).length || 0);
console.log('👨‍🏫 Professores:', Object.keys(allProfessores).length || 0);
console.log('🏫 Turmas:', Object.keys(allTurmas).length || 0);