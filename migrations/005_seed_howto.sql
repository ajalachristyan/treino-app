-- =============================================================================
-- 005_seed_howto — CONTEUDO do "modo de fazer" + categoria (Bloco 1).
--
-- Popula how_to (texto leigo offline) e category (rotulo de agrupamento da aba
-- "Exercicios") de cada exercicio do seed 002. video_url fica NULL (link e
-- opcional; entra depois, sem migracao — e UPDATE pela tela de edicao do Bloco
-- 3, ou um seed futuro).
--
-- Fonte do texto: plano-vertical-grade-operacional.md + rotina-flexibilidade-
-- core-ginastica.md (transcricao leiga, revisada pelo dono). Numeros de
-- protocolo (RPE, holds, degraus, gate dor 0-2) vem direto dos docs. PNF
-- (pancake/espacato) levam Seguranca + Avanco. Texto SEM acento (convencao do
-- 002) e SEM apostrofo (literal SQL simples). category e FREE-TEXT, so para a
-- UI — a engine NUNCA ramifica nela (004).
--
-- 2 exercicios marcados "Obs:" (banded_knee_drive, escadas) foram extrapolados
-- de conhecimento geral porque os docs so citam o nome — o dono confirma/edita.
-- =============================================================================

-- --- FORCA (Ter/Qui) --------------------------------------------------------
UPDATE exercise SET category='forca', how_to=
'Serve para: preparar o corpo, soltar articulacoes e ligar o sistema nervoso antes do treino.
Como fazer: 5 minutos de movimentos dinamicos de mobilidade (quadril, ombro, tornozelo) somados a pogos (saltinhos curtos no lugar). Sem esteira nem bike, o cardio ja vem da ginastica. Mantenha leve e crescente.
Erro comum: virar alongamento parado e longo; aqui o objetivo e movimento, nao segurar posicao.'
WHERE id='ex_aquecimento_dinamico';

UPDATE exercise SET category='forca', how_to=
'Serve para: forca maxima de agachamento, a base do salto.
Como fazer: barra apoiada no trapezio, pes na largura dos ombros; desca empurrando o quadril para tras ate a coxa passar da paralela; suba empurrando o chao. Faixa 5 a 8 reps, dupla progressao.
Erro comum: joelho cair para dentro; calcanhar levantar do chao.'
WHERE id='ex_back_squat';

UPDATE exercise SET category='forca', how_to=
'Serve para: tripla extensao explosiva (quadril, joelho, tornozelo) com alto RFD, sem o risco tecnico do power clean.
Como fazer: barra no chao como num levantamento; puxe acelerando e estendendo quadril, joelho e tornozelo de forma explosiva, com a barra colada ao corpo. Intencao maxima-rapida, nao puxar devagar. Faixa 3 a 5 reps.
Erro comum: tratar como levantamento lento (grind); aqui vale a velocidade, nao a luta contra a carga.'
WHERE id='ex_clean_pull';

UPDATE exercise SET category='forca', how_to=
'Serve para: cadeia posterior e isquiotibiais (protege o joelho e ajuda na decolagem).
Como fazer: barra na frente das coxas, joelhos levemente flexionados; empurre o quadril para tras descendo a barra colada nas pernas ate sentir o isquio alongar; volte estendendo o quadril. Faixa 6 a 10 reps.
Erro comum: arredondar a lombar; virar agachamento (dobrar muito o joelho) em vez de dobrar pelo quadril.'
WHERE id='ex_rdl';

UPDATE exercise SET category='forca', how_to=
'Serve para: forca excentrica do isquiotibial (a parte mais protetora contra lesao).
Como fazer: ajoelhado com os tornozelos presos (ou assistido por faixa/parceiro), desca o tronco a frente bem devagar segurando com o isquio o maximo possivel; use as maos para amortecer no fim. Comece assistido.
Erro comum: descer rapido demais (sem controle); dobrar pelo quadril em vez de manter o corpo reto do joelho a cabeca.'
WHERE id='ex_nordic';

UPDATE exercise SET category='forca', how_to=
'Serve para: soleo, a mola do contato do pe com o solo.
Como fazer: sentado com carga sobre os joelhos, eleve os calcanhares ate o maximo e desca controlando ate o alongamento. Faixa 8 a 12 reps.
Erro comum: amplitude curta (so balancar); pular a descida lenta.'
WHERE id='ex_panturrilha_sentada';

UPDATE exercise SET category='forca', how_to=
'Serve para: cabeca longa do triceps em posicao alongada (maior massa do braco).
Como fazer: halter ou barra acima da cabeca, cotovelos apontando para frente; desca o peso atras da cabeca dobrando so o cotovelo; estenda de volta. Faixa 8 a 12 reps.
Erro comum: abrir os cotovelos para os lados; mexer o ombro em vez de isolar o cotovelo.'
WHERE id='ex_extensao_triceps_overhead';

UPDATE exercise SET category='forca', how_to=
'Serve para: largura de ombro (deltoide lateral).
Como fazer: halteres ao lado do corpo, cotovelos levemente dobrados; eleve os bracos para os lados ate a altura dos ombros; desca controlando. Faixa 10 a 15 reps.
Erro comum: usar impulso do tronco (roubar); subir acima da linha dos ombros forcando o trapezio.'
WHERE id='ex_elevacao_lateral';

UPDATE exercise SET category='forca', how_to=
'Serve para: empurrar vertical, forca e saude do ombro.
Como fazer: barra na altura dos ombros, pes firmes; empurre a barra para cima ate estender os bracos, com o core firme; desca controlando. Faixa 6 a 10 reps.
Erro comum: arquear demais a lombar para compensar; empurrar a barra para frente em vez de reta acima da cabeca.'
WHERE id='ex_desenvolvimento';

UPDATE exercise SET category='forca', how_to=
'Serve para: puxar horizontal, equilibrio postural com o empurrar.
Como fazer: tronco inclinado a frente com a coluna neutra; puxe a barra em direcao ao abdomen levando os cotovelos para tras e apertando as escapulas; desca controlando. Faixa 8 a 12 reps.
Erro comum: arredondar as costas; usar impulso do tronco em vez dos musculos das costas.'
WHERE id='ex_remada';

UPDATE exercise SET category='forca', how_to=
'Serve para: tibial anterior, freio e equilibrio do tornozelo.
Como fazer: de costas para a parede ou sentado, com os calcanhares apoiados, puxe a ponta dos pes para cima na direcao da canela o maximo possivel; desca controlando. Rapido e leve. Faixa 12 a 20 reps.
Erro comum: amplitude curta; nao controlar a descida da ponta do pe.'
WHERE id='ex_tibial';

UPDATE exercise SET category='forca', how_to=
'Serve para: gastrocnemio (finalizador da panturrilha).
Como fazer: em pe, com ou sem halteres, eleve os calcanhares ao maximo na ponta dos pes e desca ate o alongamento. Faixa 8 a 15 reps.
Erro comum: quicar usando o tendao; amplitude curta.'
WHERE id='ex_panturrilha_em_pe';

-- --- SALTO / PLIOMETRIA -----------------------------------------------------
UPDATE exercise SET category='salto', how_to=
'Serve para: aprender a absorver o impacto da queda com seguranca (degrau 1 da escada pliometrica).
Como fazer: de cima de um degrau ou caixa baixa, deixe-se cair e aterrisse suave dobrando joelho e quadril, e CONGELE na posicao de pouso. So absorver, sem saltar de volta.
Erro comum: aterrissar duro com perna reta; tentar quicar (isso e o degrau seguinte, ainda nao).'
WHERE id='ex_drop_landings';

UPDATE exercise SET category='salto', how_to=
'Serve para: reatividade com contato curto no solo (degrau 2).
Como fazer: de uma caixa de 15 a 20 cm, caia e, ao tocar o chao, quique imediatamente para cima com o minimo de tempo de contato. Pense pe rapido e rigido, como mola.
Erro comum: afundar no chao (contato longo); aterrissar e so depois saltar, em vez de quicar reativo.'
WHERE id='ex_bounce_drop_jumps';

UPDATE exercise SET category='salto', how_to=
'Serve para: expressao reativa maxima do salto (degrau 3, o mais intenso).
Como fazer: de uma caixa de 30 a 45 cm, caia e quique para cima saltando o mais alto possivel com contato curto. So avance para ca depois de dominar os degraus anteriores.
Erro comum: usar caixa alta demais cedo demais. Gate de seguranca: so faca com dor patelar entre 0 e 2 de 10.'
WHERE id='ex_depth_jumps';

UPDATE exercise SET category='salto', how_to=
'Serve para: medir o salto vertical com corrida de aproximacao (teste de progresso).
Como fazer: faca a corrida curta de aproximacao que usa no salto, salte o mais alto possivel e registre a altura alcancada. Use como teste periodico, nao como treino pesado diario.
Erro comum: nao padronizar a aproximacao (passos e velocidade), o que torna a medida nao comparavel entre semanas.'
WHERE id='ex_approach_jump';

UPDATE exercise SET category='forca', how_to=
'Serve para: teto de taxa de forca (RFD) e drive neural no angulo do salto, com baixa fadiga.
Como fazer: posicione a barra ou objeto inamovivel no angulo do salto e empurre com intencao explosiva maxima por poucos segundos, como se tentasse mover algo impossivel. Forca total, sem movimento.
Erro comum: empurrar devagar e crescente; aqui a intencao tem que ser imediata e explosiva.'
WHERE id='ex_isometria_balistica';

UPDATE exercise SET category='forca', how_to=
'Serve para: gluteo e extensao de quadril (a decolagem do salto).
Como fazer: costas apoiadas num banco, barra sobre o quadril, pes no chao; estenda o quadril para cima ate alinhar tronco e coxa, apertando o gluteo no topo; desca controlando. Faixa 8 a 12 reps.
Erro comum: estender a lombar em vez do quadril; nao apertar o gluteo no topo.'
WHERE id='ex_hip_thrust';

UPDATE exercise SET category='salto', how_to=
'Serve para: potencia unilateral de perna (uma perna de cada vez).
Como fazer: pe de tras apoiado num banco, desca o agachamento na perna da frente e suba saltando, decolando do chao; aterrisse suave e repita. Pode usar halteres leves.
Erro comum: fazer no mesmo dia dos depth jumps (nunca junte os dois); aterrissar duro sem absorver.'
WHERE id='ex_jumping_bulgarian';

UPDATE exercise SET category='forca', how_to=
'Serve para: ativar o sistema nervoso (potenciacao) antes do salto, no complexo de Sabado.
Como fazer: empurre um objeto inamovivel com forca explosiva maxima por poucos segundos. Em seguida descanse 3 a 4 minutos antes de saltar (faz parte do complexo de potenciacao).
Erro comum: nao descansar o suficiente depois, a potenciacao precisa de 3 a 4 min para aparecer.'
WHERE id='ex_iso_explosiva_max';

UPDATE exercise SET category='salto', how_to=
'Serve para: saltar aproveitando a potenciacao (PAP) gerada pela isometria ou agachamento pesado.
Como fazer: apos a isometria explosiva maxima (ou agachamento pesado) e 3 a 4 min de descanso, faca saltos com intencao maxima de altura. Poucas repeticoes, qualidade alta.
Erro comum: saltar cansado ou com muitas reps (perde o efeito); pular o descanso de 3 a 4 min.'
WHERE id='ex_salto_potenciado';

UPDATE exercise SET category='forca', how_to=
'Serve para: forca geral com a barra na dobra dos cotovelos (variacao Zercher), de forma leve.
Como fazer: barra apoiada na dobra dos cotovelos contra o corpo; agache mantendo o tronco ereto e suba. Mantenha LEVE, e complemento, nao levantamento maximo.
Erro comum: empilhar carga pesada quando ja levantou pesado na semana (nao some fadiga desnecessaria).'
WHERE id='ex_zercher_leve';

-- --- GINASTICA (Seg/Qua/Sex) ------------------------------------------------
UPDATE exercise SET category='ginastica', how_to=
'Serve para: praticar os skills acrobaticos (tuck/mortal, rodante, estrela, flick).
Como fazer: treine os elementos com foco e qualidade, sempre em ambiente com colchao e supervisao (spotting). Mortal e flick so com seguranca adequada; em casa, apenas preparacao fisica.
Erro comum: tentar elementos de risco (mortal/flick) sem colchao ou spotting.'
WHERE id='ex_acrobacia';

UPDATE exercise SET category='ginastica', how_to=
'Serve para: puxar vertical (forca de costas e bracos para os skills).
Como fazer: pendurado na barra com pegada na largura dos ombros, puxe o corpo ate o queixo passar a barra; desca controlando ate estender os bracos. Faixa 4 a 10 reps.
Erro comum: usar impulso de perna; nao completar a amplitude (queixo nao passa ou bracos nao estendem embaixo).'
WHERE id='ex_barra';

UPDATE exercise SET category='ginastica', how_to=
'Serve para: empurrar vertical (peito, triceps e ombro para os skills).
Como fazer: apoiado em paralelas com bracos estendidos, desca dobrando os cotovelos ate o ombro chegar na altura do cotovelo; empurre de volta ate estender. Faixa 4 a 10 reps.
Erro comum: descer raso; jogar os ombros muito a frente forcando a articulacao.'
WHERE id='ex_dips';

UPDATE exercise SET category='ginastica', how_to=
'Serve para: ativar o flexor de quadril antes da aula de ginastica (pre-aula).
Como fazer: com uma faixa elastica resistindo no joelho ou na coxa, em pe, eleve o joelho a frente de forma firme e controlada ate a altura do quadril; alterne as pernas.
Erro comum: inclinar o tronco para tras para roubar; perder o controle na descida do joelho.
Obs: os docs so citam o nome e a funcao (pre-aula, flexor de quadril); a execucao acima e geral, confira se bate com a sua.'
WHERE id='ex_banded_knee_drive';

UPDATE exercise SET category='ginastica', how_to=
'Serve para: gluteo medio e controle do valgo do joelho (finalizador rapido).
Como fazer: faixa elastica ao redor das coxas ou tornozelos; abra as pernas para o lado contra a resistencia da faixa e volte controlando. Pode ser em pe ou deitado de lado. Faixa 12 a 20 reps.
Erro comum: deixar o joelho cair para dentro; usar impulso em vez de controle.'
WHERE id='ex_abducao_faixa';

-- --- MOBILIDADE / CORE / FLEXIBILIDADE --------------------------------------
UPDATE exercise SET category='mobilidade', how_to=
'Serve para: soltar o flexor de quadril na versao ativa e segura.
Como fazer: joelho de tras apoiado com o pe subindo na parede ou sofa, perna da frente firme; faca a bascula pelvica posterior e aperte o gluteo do lado de tras, sentindo o alongamento do flexor sem forcar a lombar. 40s por lado.
Erro comum: jogar a lombar em arco em vez de bascular a pelve e ativar o gluteo. Dor na articulacao (nao no musculo) ou recorrente pede avaliacao de fisio.'
WHERE id='ex_couch_stretch_ativo';

UPDATE exercise SET category='mobilidade', how_to=
'Serve para: adutor (interno da coxa) e mobilidade de tornozelo sob carga.
Como fazer: pes bem afastados, desloque o peso para um lado agachando nessa perna enquanto a outra fica estendida com a ponta do pe para cima; volte e alterne. 2x6 por lado.
Erro comum: levantar o calcanhar da perna que agacha; arredondar as costas no fundo.'
WHERE id='ex_cossack_squat';

UPDATE exercise SET category='mobilidade', how_to=
'Serve para: extensao da coluna toracica e ombro (base de rodante, estrela, flick e ponte).
Como fazer: deitado com um rolo na altura das escapulas, apoie a cabeca nas maos e estenda so o meio das costas sobre o rolo, sem forcar a lombar. 60s.
Erro comum: jogar a extensao para a lombar; ficar so rolando em vez de trabalhar o meio das costas.'
WHERE id='ex_extensao_toracica_rolo';

UPDATE exercise SET category='mobilidade', how_to=
'Serve para: amplitude de ombro acima da cabeca (overhead).
Como fazer: com um bastao, faca a flexao de ombro levando os bracos acima da cabeca, somado a cat stretch e dislocates com o bastao para abrir o ombro. 2x10.
Erro comum: arquear a lombar para parecer que o braco sobe mais; lembrar que ombro tenso e muitas vezes rigidez toracica disfarcada.'
WHERE id='ex_shoulder_flexion';

UPDATE exercise SET category='mobilidade', how_to=
'Serve para: amplitude ATIVA de quadril (a que voce controla, usada nos skills).
Como fazer: em pe ou deitado, eleve a perna estendida a frente e depois para o lado o mais alto que conseguir com controle, sem balanco. 2x8 por lado.
Erro comum: usar balanco e impulso em vez de elevar com a propria forca; dobrar o joelho para subir mais.'
WHERE id='ex_elevacao_ativa_perna';

UPDATE exercise SET category='mobilidade', how_to=
'Serve para: rotacao de quadril (destrava o caminho para o espacato).
Como fazer: sentado com as duas pernas dobradas a 90 graus (uma a frente, uma ao lado), gire os quadris alternando os lados sem usar as maos, mantendo o tronco ereto. 2x6 por lado.
Erro comum: empurrar com as maos; deixar o tronco desabar para ganhar amplitude falsa.'
WHERE id='ex_9090_hip_switches';

UPDATE exercise SET category='core', how_to=
'Serve para: core anti-extensao (canoinha) e extensao (superman) que mantem a forma e protege a lombar.
Como fazer: canoinha: deitado de costas, lombar colada no chao, eleve pernas e bracos comecando agrupado e progredindo conforme o controle. Superman: deitado de bruco, eleve bracos e pernas engajando o gluteo. Respire continuo.
Erro comum: tremor por prender a respiracao e alavanca longa demais; na canoinha, deixar a lombar descolar do chao (regrida um degrau, nao force).'
WHERE id='ex_hollow_superman';

UPDATE exercise SET category='mobilidade', how_to=
'Serve para: preparar e dar seguranca ao punho para o apoio de mao.
Como fazer: ajoelhado com as maos no chao, balance o peso do corpo para frente, para tras e para os lados sobre os punhos, dentro do conforto. 30s.
Erro comum: forcar amplitude com dor; carregar peso demais no punho cedo demais.'
WHERE id='ex_wrist_rocks';

UPDATE exercise SET category='core', how_to=
'Serve para: forca ativa de compressao (resolve o tuck do salto) e reabilita o flexor de quadril.
Como fazer: deitado de costas, agrupe levando joelhos ao peito e tronco para cima ao mesmo tempo, e volte com controle. 2x8.
Erro comum: usar impulso e balanco em vez de puxar ativo; deixar a lombar arquear.'
WHERE id='ex_tuck_ups';

UPDATE exercise SET category='core', how_to=
'Serve para: forca de compressao ativa do quadril (puxar e segurar as pernas).
Como fazer: sentado com as pernas estendidas a frente, puxe as pernas ativamente para cima e contra o chao gerando compressao, e segure. 3x10s.
Erro comum: so apoiar passivo; aqui precisa de puxar ativo, gerando tensao.'
WHERE id='ex_v_sit_compression';

UPDATE exercise SET category='core', how_to=
'Serve para: compressao e controle de core na transicao ate ficar em pe.
Como fazer: deitado, role para tras levando as pernas para cima (vela) e role de volta com controle ate ficar em pe. 2x5.
Erro comum: usar impulso descontrolado para levantar em vez de rolar com controle.'
WHERE id='ex_candlestick';

UPDATE exercise SET category='mobilidade', how_to=
'Serve para: extensao distribuida entre ombro, toracica e quadril (base da ponte), com seguranca lombar.
Como fazer: progrida por degraus, 1) ponte com os pes elevados (tira a lombar, enfatiza ombro e toracica), 2) ponte do chao empurrando o peito a frente, 3) descer a ponte a partir da parede com controle. Suba de degrau so com criterio.
Erro comum: arquear so pela lombar (vetor numero 1 de lesao). Se sentir na lombar, regrida e abra mais ombro e toracica.'
WHERE id='ex_ponte_escada';

UPDATE exercise SET category='mobilidade', how_to=
'Serve para: amplitude de ombro acima da cabeca (overhead).
Como fazer: com bastao ou faixa, leve os bracos da frente do corpo ate atras passando por cima da cabeca (dislocate), e faca wall slides deslizando os bracos pela parede. 2x10.
Erro comum: pegada estreita demais (forca o ombro); arquear a lombar para compensar falta de ombro.'
WHERE id='ex_dislocates_wall_slides';

UPDATE exercise SET category='core', how_to=
'Serve para: estabilidade de core anti-extensao com baixo risco (construtor base).
Como fazer: deitado de costas, lombar colada no chao, bracos e joelhos no ar; desca o braco e a perna OPOSTOS devagar sem descolar a lombar, e volte. 2x8 por lado.
Erro comum: deixar a lombar arquear ao descer braco e perna; prender a respiracao.'
WHERE id='ex_dead_bug';

UPDATE exercise SET category='core', how_to=
'Serve para: estabilidade anti-extensao e anti-rotacao em quatro apoios.
Como fazer: em quatro apoios, estenda braco e perna OPOSTOS mantendo o quadril nivelado, sem rodar o tronco; volte e alterne. 2x8 por lado.
Erro comum: rodar ou inclinar o quadril ao estender; arquear a lombar.'
WHERE id='ex_bird_dog';

UPDATE exercise SET category='core', how_to=
'Serve para: forca anti-extensao mais forte (transfere para o tuck e a ponte).
Como fazer: ajoelhado segurando a roda, role para frente estendendo o corpo o quanto controla sem deixar a lombar ceder, e volte puxando com o core. Comece parcial ajoelhado e progrida para completo. Progride depois de dominar a prancha.
Erro comum: avancar alem do controle e deixar a lombar arquear; puxar com os bracos em vez do core.'
WHERE id='ex_ab_wheel';

UPDATE exercise SET category='core', how_to=
'Serve para: forca de core anti-rotacao.
Como fazer: em pe ao lado de uma faixa presa na altura do peito, segure com as duas maos e empurre a faixa para frente resistindo a rotacao que ela puxa; segure e volte. 2x10 por lado.
Erro comum: deixar o tronco girar na direcao da faixa; usar so os bracos sem firmar o core.'
WHERE id='ex_pallof_press';

UPDATE exercise SET category='flexibilidade', how_to=
'Serve para: abrir o straddle/pancake (linha de perna, postura e estetica). Trilha paralela, nao gargalo dos skills.
Como fazer: sentado com as pernas afastadas, caminhe as maos a frente buscando levar o tronco em direcao ao chao com a coluna o mais ereta possivel. Use a escada A (sentado elevado, pernas na parede, frog, good morning afastado leve) e finalize com PNF contrai-relaxa.
Erro comum: arredondar a lombar e forcar pelo tronco em vez de inclinar pela pelve.
Seguranca: no PNF, contraia a RPE 7 a 8 (esforco forte mas sustentavel), NUNCA 9 a 10, dor ativa o reflexo que trava o musculo.
Avanco: sustenta a posicao-alvo no tempo, com RPE 5 ou menos, sem compensacao, em 2 sessoes seguidas. Estagnou 3 semanas: mais frequencia ou +1 ciclo PNF, nunca mais dor.'
WHERE id='ex_pancake_straddle';

UPDATE exercise SET category='flexibilidade', how_to=
'Serve para: abrir o espacato lateral (adutores), pela linha de perna e postura. Trilha paralela.
Como fazer: progrida pela escada B, cossack, frog, afastamento em pe descendo com apoio poucos cm por semana, espacato com blocos e tronco a frente. Finalize com PNF contrai-relaxa.
Erro comum: descer rapido buscando o chao na marra; abrir sem apoio e sem controle.
Seguranca: no PNF, contraia a RPE 7 a 8, NUNCA 9 a 10 (dor ativa o reflexo protetor que trava o ganho).
Avanco: sustenta a posicao-alvo no tempo, com RPE 5 ou menos, sem compensacao, em 2 sessoes seguidas. Estagnou 3 semanas: mais frequencia ou +1 ciclo PNF, nunca mais intensidade.'
WHERE id='ex_espacato_lateral';

UPDATE exercise SET category='mobilidade', how_to=
'Serve para: recuperacao ativa e condicionamento aerobio leve no domingo.
Como fazer: suba e desca escadas em ritmo leve a moderado como recuperacao ativa, sem buscar exaustao.
Erro comum: transformar a recuperacao ativa em treino intenso, roubando a recuperacao.
Obs: os docs so citam escadas como recuperacao ativa/condicionamento no domingo, sem detalhar protocolo nem confirmar se e subir escadas; confira tempo e intensidade.'
WHERE id='ex_escadas';

-- Bumpa o schema para 5 (mesmo relogio de runtime das migrations anteriores).
INSERT INTO schema_version (version, applied_at)
VALUES (5, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
