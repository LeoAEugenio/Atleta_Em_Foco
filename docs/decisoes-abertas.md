# Requisitos definidos e pontos em aberto

## Regras definidas pelo clube

1. Cada atleta envia uma avaliação pré-treino e uma pós-treino por sessão.
2. No mapa corporal, basta marcar cada região com desconforto; não há intensidade individual por região.
3. Perguntas e escalas são fixas nesta versão.
## Alterações aplicadas após a reunião com os orientadores

- O nome da aplicação passou de LCAF para **Atleta em Foco**.
- O mapa passou a usar uma figura frontal com anatomia interna e uma vista posterior que destaca os músculos; as regiões clicáveis incluem mãos e pés.
- A aplicação passou a usar PostgreSQL, uma alternativa de código aberto. Os registros da base SQL Server anterior não foram transferidos.

## Fluxo atualmente implementado

A comissão cadastra treinos e partidas, e o atleta seleciona a sessão correspondente. Essa foi a solução implementada para identificar cada treino, mas ainda pode ser confirmada com o clube e os orientadores.

## Pontos que seguem em aberto

- A hospedagem para acesso fora do computador local ainda será definida com os orientadores.
- Testes de uso com atletas e comissão ainda precisam ser feitos.
- A autenticação temporária do protótipo deve ser revista antes de qualquer uso operacional.
