# Atleta em Foco

O Atleta em Foco é um protótipo web que foi desenvolvido durante o estágio para ajudar a comissão técnica do Clube Esportivo Aimoré a acompanhar o bem-estar dos atletas. A aplicação reúne as avaliações antes e depois dos treinos e permite consultar os registros em um painel.

## Como funciona

A comissão técnica cadastra os treinos e as partidas. O atleta seleciona uma sessão e pode enviar uma avaliação pré-treino e uma pós-treino para ela.

No pré-treino, o atleta pode indicar onde sente dor clicando nas regiões do mapa corporal, que tem vistas de frente e de costas. Nesta versão, o formulário registra as regiões selecionadas sem pedir uma nota de intensidade para cada uma. As perguntas e as escalas são fixas.

A comissão técnica pode acompanhar as respostas no painel, consultar os relatórios e exportar os registros em CSV.

## Tecnologias

- Interface: HTML, CSS e JavaScript.
- API: ASP.NET Core Minimal API (.NET 9).
- Banco de dados: PostgreSQL.

## Rodar com Docker

1. Abra o Docker Desktop e espere ele iniciar. Se recebeu o projeto em ZIP, extraia o arquivo.
2. Abra o PowerShell ou o terminal na pasta que contém o `docker-compose.yml` e execute:

   ```powershell
   docker compose up --build -d
   ```

3. Quando o comando terminar, abra <http://127.0.0.1:8080>.

O Docker inicia a interface, a API e o banco. A primeira execução pode demorar alguns minutos porque precisa baixar as imagens e as dependências. Não é necessário instalar o .NET ou o PostgreSQL separadamente.

Se a página não abrir, rode `docker compose ps` para conferir se os serviços estão ativos ou `docker compose logs --tail=80` para ver os logs. Para testar a conexão da API com o banco, acesse <http://127.0.0.1:8080/api/health/db>.

Para parar o projeto, use `docker compose down`. Os dados de teste ficam guardados. Use `docker compose down -v` apenas se quiser apagar as contas, sessões e avaliações criadas nesse ambiente.

## Primeiro acesso e teste

1. Na tela inicial, clique em **Configurar os primeiros acessos**. Crie um usuário de comissão e um de atleta, por exemplo, `comissao.teste` e `atleta.teste`, com senhas de pelo menos oito caracteres, por exemplo, `teste123`. O segundo usuário fica vinculado ao atleta de demonstração.
2. Entre como comissão, abra **Atletas e acessos** e cadastre uma sessão de treino com a data de hoje.
3. Saia e entre como atleta. Selecione a sessão, preencha o pré-treino e marque uma região no mapa corporal. Depois, envie o pós-treino para a mesma sessão.
4. Volte ao perfil da comissão para conferir as respostas em **Visão geral** e **Relatórios**. Em **Relatórios**, também dá para exportar o CSV.

## Rodar sem Docker no Windows

1. Instale o SDK do .NET 9, o PostgreSQL e a extensão Live Server do VS Code.
2. Se ainda não tiver o banco configurado, crie um banco chamado `atleta_em_foco` e execute nele o script `database/001_schema_postgresql.sql`.
3. Abra o PowerShell na pasta do projeto. Substitua `SUA_SENHA_DO_POSTGRES` pela senha do banco local e rode:

   ```powershell
   $env:ConnectionStrings__DefaultConnection = 'Host=localhost;Port=5432;Database=atleta_em_foco;Username=postgres;Password=SUA_SENHA_DO_POSTGRES'
   cd .\AtletaEmFoco.Api
   dotnet run
   ```

4. Deixe a API rodando e, no VS Code, clique com o botão direito em `index.html`. Escolha **Open with Live Server** e use a porta `5500`. Para conferir a conexão da API com o banco, acesse <http://localhost:5042/api/health/db>.

## Banco de dados

O Docker executa o script [`001_schema_postgresql.sql`](database/001_schema_postgresql.sql) ao criar o banco pela primeira vez. O script cria as tabelas e inclui um atleta de demonstração. O modelo está descrito em [`docs/modelo-dados.md`](docs/modelo-dados.md).

## Estado do projeto

Testei o protótipo localmente com Docker. O próximo passo é testar os formulários e o painel com os atletas e a comissão técnica. Nesta versão, reiniciar a API encerra as sessões de login, então é preciso entrar novamente.