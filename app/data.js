/* Dados da Central TV. Para atualizar, peça ao Claude: "atualiza os dados da TV". */
var DADOS = {
  nome: 'Daniel',
  cor: '#FF7FA8',            /* cor de destaque: #FF7FA8 rosa, #8FE3FF azul, #FFD36E amarelo, #9CF2A8 verde */
  cidade: { nome: 'Rio de Janeiro', lat: -22.91, lon: -43.17 },
  evo: '2027-03-26',

  /* match: pedaços do nome do app na TV; id: código do app na loja Samsung (reserva) */
  apps: [
    { nome: 'PS5', tipo: 'ps5', cor: '#24306A', icone: 'M6 8h12a4 4 0 0 1 0 9H6a4 4 0 0 1 0-9zM7.5 11v3M6 12.5h3M15.5 12h.01M17.5 13.5h.01' },
    { nome: 'YouTube', match: ['youtube'], id: '111299001912', cor: '#5A1A30', icone: 'M6 5h12a3.5 3.5 0 0 1 3.5 3.5v7A3.5 3.5 0 0 1 18 19H6a3.5 3.5 0 0 1-3.5-3.5v-7A3.5 3.5 0 0 1 6 5zM10 9.5v5l4.5-2.5z' },
    { nome: 'Twitch', match: ['twitch'], cor: '#3A2470', icone: 'M4 3h16v11l-4 4h-4l-3 3v-3H4zM11 7v4M15 7v4' },
    { nome: 'Spotify', match: ['spotify'], id: '3201606009684', cor: '#15483A', icone: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },
    { nome: 'Crunchyroll', match: ['crunchyroll'], cor: '#6A3214', icone: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 8.5v7l5.5-3.5z' },
    { nome: 'Disney+', match: ['disney'], id: '3201901017640', cor: '#1A2E6E', icone: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z' },
    { nome: 'Netflix', match: ['netflix'], id: '3201907018807', cor: '#561A1E', icone: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4' },
    { nome: 'Prime Video', match: ['prime video', 'amazon'], id: '3201910019365', cor: '#123F5C', icone: 'M3 6h18v11H3zM8 21h8M12 17v4' }
  ],

  projetos: [
    { nome: 'Evo Brazil (SF6)', tag: 'SF6', cor: '#FF7FA8', passo: 'Gravar no training mode os golpes do Alex com input display' },
    { nome: 'Vibe coding na TV', tag: 'TV', cor: '#8FE3FF', passo: 'Instalar a Central TV na TV (modo desenvolvedor)' },
    { nome: 'Canal e stream', tag: 'Twitch', cor: '#C8A6FF', passo: 'Configurar o canal: foto, banner, bio, painéis e categoria SF6' },
    { nome: 'Skills para o trabalho', tag: 'Trabalho', cor: '#FFD36E', passo: 'Triagem de e-mails do Outlook' },
    { nome: 'Analisador de partidas', tag: 'SF6', cor: '#FF7FA8', passo: 'Rodar o Analisar partidas.bat pela primeira vez' },
    { nome: 'Simulador da reforma', tag: 'Trabalho', cor: '#FFD36E', passo: 'Atualizar a CBS quando o Senado fixar (até 15/12)' },
    { nome: 'PS5: cheats e Estante', tag: 'Jogos', cor: '#9CF2A8', passo: 'Testar o cheat "Cartas: sempre as melhores" no Kyoto' }
  ],

  /* Treino de SF6 por dia da semana (0 = domingo) */
  sf6: [
    { curto: 'Revisão 1h30', tarefas: ['Revisão da semana e registro no plano (1h30)'] },
    { curto: 'Lab 1h30', tarefas: ['Laboratório: punições e combos do Alex (1h30)'] },
    { curto: 'Ranked 2h', tarefas: ['Ranked focando na meta da semana (2h)'] },
    { curto: 'Replays + lab', tarefas: ['Replays: rever as partidas de ontem (1h)', 'Laboratório: punir golpes inseguros (30 min)'] },
    { curto: 'Sets 2h', tarefas: ['Sets longos contra o mesmo adversário (2h)'] },
    { curto: 'Folga', tarefas: ['Folga: descansar as mãos'] },
    { curto: 'Torneio 3h', tarefas: ['Torneio online (3h)'] }
  ],
  fases: [
    { ini: '2026-11-01', fim: '2026-11-22', nome: 'Fase 1: Diagnóstico' },
    { ini: '2026-11-23', fim: '2027-01-03', nome: 'Fase 2: Base e execução' },
    { ini: '2027-01-04', fim: '2027-02-07', nome: 'Fase 3: Matchups' },
    { ini: '2027-02-08', fim: '2027-03-14', nome: 'Fase 4: Simulação de torneio' },
    { ini: '2027-03-15', fim: '2027-03-25', nome: 'Fase 5: Polimento e descanso' }
  ],
  erros: {
    sessao: '',
    meta: 'Meta da semana: definida depois da primeira sessão (o treino começa em 1/11)',
    lista: []
  },

  /* Academia (igual à aba Treino da Central) */
  academia: {
    semana: [{ t: null, j: false }, { t: 'C', j: true }, { t: 'A', j: false }, { t: 'C', j: true }, { t: 'B', j: false }, { t: 'C', j: true }, { t: 'A', j: true }],
    planos: {
      A: { nome: 'Pernas e explosão', g: [['Aquecimento', [['Aquecimento', '8 min']]], ['Explosão', [['Salto na caixa ou vertical', '4 x 4']]], ['Pernas', [['Leg press 45° (pesado)', '4 x 8'], ['Cadeira extensora', '3 x 12'], ['Mesa ou cadeira flexora', '3 x 12'], ['Cadeira adutora', '3 x 15'], ['Cadeira abdutora', '3 x 15'], ['Panturrilha na máquina', '4 x 15']]], ['Superiores', [['Supino na máquina', '3 x 10'], ['Puxada frontal', '3 x 10']]], ['Core', [['Abdominal na máquina', '3 x 15'], ['Prancha', '3 x 40 s']]]] },
      B: { nome: 'Superiores, braço e fôlego', g: [['Aquecimento', [['Aquecimento', '8 min']]], ['Pernas (moderado)', [['Leg press 45° (moderado)', '3 x 12'], ['Cadeira flexora', '3 x 12']]], ['Superiores', [['Supino inclinado na máquina', '3 x 10'], ['Remada sentada na máquina', '3 x 10'], ['Desenvolvimento na máquina', '3 x 10']]], ['Braços', [['Tríceps na polia com corda', '3 x 12'], ['Tríceps na máquina', '3 x 12'], ['Rosca direta na máquina', '3 x 12'], ['Rosca martelo na polia', '3 x 12']]], ['Core', [['Abdominal na polia', '3 x 15'], ['Elevação de pernas no paralelo', '3 x 12']]], ['Fôlego', [['Bike intervalada', '10 x 20 s']]]] },
      C: { nome: 'Fôlego e core', g: [['Fôlego', [['Bike ou esteira inclinada', '25 min']]], ['Circuito de core', [['Elevação de pernas no paralelo', '3 x 12'], ['Abdominal na máquina', '3 x 15'], ['Prancha', '3 x 40 s'], ['Prancha lateral', '3 x 30 s cada lado']]], ['Braço', [['Tríceps na polia com corda (leve)', '2 x 15']]]] }
    }
  }
};
