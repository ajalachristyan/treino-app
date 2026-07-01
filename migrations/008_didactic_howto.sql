-- =============================================================================
-- 008_didactic_howto — "modo de fazer" mais didatico (linguagem de iniciante) +
-- torácica sem rolo. So UPDATE de name/how_to (nenhum e imutavel; o trigger de
-- imutabilidade so pega progression_type/exercise_id). NAO toca plano/sessao.
--
-- Escopo: os exercicios que um iniciante mais tropeça e que aparecem cedo no
-- plano (aquecimento, terca, sexta) + a torácica (o dono nao tem rolo). Os demais
-- textos ficam para uma proxima leva; enquanto isso o botao "Ver no YouTube"
-- (em cada exercicio) cobre qualquer duvida. Textos accent-free (convencao do
-- seed). As descricoes de tecnica sao para o dono validar / conferir no video.
-- =============================================================================

-- Torácica: nao precisa de rolo. Renomeia e explica as 3 formas (rolo/toalha/cadeira).
UPDATE exercise SET
  name = 'Extensao toracica (rolo, cadeira ou toalha) 60s',
  how_to = 'Serve para: soltar a parte de CIMA das costas (a regiao entre as escapulas), o que ajuda em rodante, estrela, flick e ponte.
Como fazer (tanto faz o apoio): (1) rolo de espuma no chao, deitado, o rolo na altura das escapulas; ou (2) SEM rolo, deitado com uma TOALHA bem enrolada (ou um travesseiro firme) atravessada no meio das costas; ou (3) sentado numa CADEIRA, maos atras da cabeca, arqueando so o meio das costas por cima do encosto. Em qualquer versao: apoie a cabeca nas maos e estenda SO o meio das costas, devagar, sem forcar a parte baixa (lombar). 60 segundos.
Erro comum: jogar a curvatura para a lombar em vez do meio das costas.
Obs: nao precisa de rolo — a toalha ou a cadeira fazem o mesmo. Em duvida, toque em "Ver no YouTube".'
WHERE id = 'ex_extensao_toracica_rolo';

-- Aquecimento dinamico: define "pogos" e o que fazer nos 5 min.
UPDATE exercise SET how_to = 'Serve para: esquentar o corpo e "ligar" os musculos antes de treinar, sem cansar.
Como fazer: 5 minutos em movimento continuo e leve, misturando duas coisas. (a) Mobilidade: girar e mover quadril, ombros e tornozelos com controle, em toda a amplitude. (b) Pogos: saltinhos curtos e rapidos no lugar, na ponta dos pes, mal saindo do chao (como pular corda, mas sem a corda). Comece bem leve e aumente um pouco ao longo dos 5 min.
Erro comum: virar alongamento parado e longo — aqui e MOVIMENTO, nao segurar posicao; ou comecar forte demais.
Obs: "pogos" = esses saltinhos curtos na ponta do pe. Em duvida, "Ver no YouTube".'
WHERE id = 'ex_aquecimento_dinamico';

-- Drop landings: "absorver/congelar" em linguagem simples.
UPDATE exercise SET how_to = 'Serve para: aprender a CAIR e amortecer com seguranca — a base antes de qualquer salto (degrau 1).
Como fazer: em cima de um degrau ou caixa baixa, deixe-se CAIR (nao pule) e aterrisse macio, dobrando joelho e quadril, e CONGELE parado na posicao de pouso por 1 a 2 segundos. So absorver o impacto; nao salte de volta.
Erro comum: cair com a perna dura/reta; ou tentar quicar para cima (isso e o proximo degrau, ainda nao).
Obs: pense em "pousar como um gato e travar". Em duvida, "Ver no YouTube".'
WHERE id = 'ex_drop_landings';

-- Isometria balistica: RFD/drive neural em linguagem simples.
UPDATE exercise SET how_to = 'Serve para: treinar a forca EXPLOSIVA no angulo do salto, empurrando algo que nao se move (pouco desgaste, muito estimulo).
Como fazer: posicione a barra (ou algo travado/inamovivel) na altura do angulo do seu salto e EMPURRE com toda a forca e o mais RAPIDO que conseguir por poucos segundos, como se tentasse mover algo impossivel. A explosao tem que ser total e imediata. Nada se move — o esforco e todo interno.
Erro comum: empurrar devagar e ir aumentando; aqui e explosao IMEDIATA desde o primeiro instante.
Obs: forca maxima e rapida, sem movimento acontecer. Em duvida, "Ver no YouTube".'
WHERE id = 'ex_isometria_balistica';

-- Clean pull: tripla extensao explosiva sem jargao.
UPDATE exercise SET how_to = 'Serve para: treinar a extensao EXPLOSIVA de quadril, joelho e tornozelo ao mesmo tempo (o "motor" do salto), sem a tecnica dificil do levantamento olimpico.
Como fazer: barra no chao, como no inicio de um levantamento; puxe a barra para cima ACELERANDO e estendendo quadril, joelho e tornozelo de forma explosiva, com a barra colada ao corpo. O foco e a VELOCIDADE, nao o peso. 3 a 5 repeticoes.
Erro comum: puxar devagar lutando contra a carga (grind). Peso alto demais que te faz perder a velocidade atrapalha — e um puxao explosivo, nao um levantamento lento.
Obs: em duvida, "Ver no YouTube".'
WHERE id = 'ex_clean_pull';

-- Bumpa o schema para 8 (mesmo relogio de runtime das migrations anteriores).
INSERT INTO schema_version (version, applied_at)
VALUES (8, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
