using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AtletaEmFoco.Api.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddCors(options => options.AddPolicy("LocalFrontend", policy =>
    policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddDbContext<AtletaEmFocoDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Reiniciar a API invalida os tokens de login.
var tokenSecret = RandomNumberGenerator.GetBytes(32);
var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseCors("LocalFrontend");
    app.MapOpenApi();
}

app.MapGet("/api/health/db", async (AtletaEmFocoDbContext db) =>
{
    try
    {
        await db.Database.OpenConnectionAsync();
        await db.Database.CloseConnectionAsync();
        return (IResult)Results.Ok(new { status = "Conectado ao banco", banco = "atleta_em_foco" });
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Erro ao conectar ao PostgreSQL.");
        return (IResult)Results.Json(new { status = "Erro de conexão", message = "Confira se o PostgreSQL está ativo e se a conexão está correta." }, statusCode: 503);
    }
});

app.MapGet("/api/auth/status", async (AtletaEmFocoDbContext db) =>
{
    var ready = await db.AppUsers.AnyAsync(u => u.IsActive && !u.PasswordHash.StartsWith("TEMPORARIO_"));
    return Results.Ok(new { initialized = ready, setupAvailable = app.Environment.IsDevelopment() });
});

app.MapPost("/api/auth/setup", async (SetupRequest request, AtletaEmFocoDbContext db) =>
{
    if (!app.Environment.IsDevelopment())
        return (IResult)Results.NotFound();

    if (!ValidCredentials(request.AthleteUsername, request.AthletePassword) ||
        !ValidCredentials(request.CommissionUsername, request.CommissionPassword))
        return (IResult)Results.BadRequest(new { message = "Use nomes de usuário válidos e senhas com pelo menos 8 caracteres." });

    if (string.Equals(request.AthleteUsername.Trim(), request.CommissionUsername.Trim(), StringComparison.OrdinalIgnoreCase))
        return (IResult)Results.BadRequest(new { message = "Atleta e comissão precisam ter nomes de usuário diferentes." });

    var users = await db.AppUsers.ToListAsync();
    if (users.Any(u => u.IsActive && !u.PasswordHash.StartsWith("TEMPORARIO_")))
        return (IResult)Results.Conflict(new { message = "A configuração inicial já foi concluída. Entre com seu usuário e senha." });

    var athlete = await db.Athletes.OrderBy(a => a.AthleteId).FirstOrDefaultAsync();
    if (athlete is null)
        return (IResult)Results.Conflict(new { message = "Não há atleta cadastrado no banco. Confira se o registro de demonstração existe." });

    var athleteUser = users.FirstOrDefault(u => u.AthleteId == athlete.AthleteId);
    if (athleteUser is null)
    {
        athleteUser = new AppUser { Role = "Athlete", AthleteId = athlete.AthleteId, IsActive = true };
        db.AppUsers.Add(athleteUser);
    }
    athleteUser.Username = request.AthleteUsername.Trim();
    athleteUser.PasswordHash = PasswordHash.Create(request.AthletePassword);
    athleteUser.Role = "Athlete";
    athleteUser.IsActive = true;

    var commissionUser = users.FirstOrDefault(u => u.Role == "Commission");
    if (commissionUser is null)
    {
        commissionUser = new AppUser { Role = "Commission", IsActive = true };
        db.AppUsers.Add(commissionUser);
    }
    commissionUser.Username = request.CommissionUsername.Trim();
    commissionUser.PasswordHash = PasswordHash.Create(request.CommissionPassword);
    commissionUser.AthleteId = null;
    commissionUser.Role = "Commission";
    commissionUser.IsActive = true;

    try
    {
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException)
    {
        return (IResult)Results.Conflict(new { message = "Um desses nomes de usuário já está em uso." });
    }

    return (IResult)Results.Ok(new { message = "Contas criadas. Entre com uma delas para continuar." });
});

app.MapPost("/api/auth/login", async (LoginRequest request, AtletaEmFocoDbContext db) =>
{
    var username = request.Username?.Trim();
    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(request.Password))
        return (IResult)Results.BadRequest(new { message = "Informe usuário e senha." });

    var user = await db.AppUsers.AsNoTracking()
        .FirstOrDefaultAsync(u => u.Username == username && u.IsActive);
    if (user is null || !PasswordHash.Verify(request.Password, user.PasswordHash))
        return (IResult)Results.Unauthorized();

    var athleteName = user.AthleteId is int athleteId
        ? await db.Athletes.AsNoTracking().Where(a => a.AthleteId == athleteId).Select(a => a.FullName).FirstOrDefaultAsync()
        : null;
    var session = new AuthSession(user.AppUserId, user.Username, user.Role, user.AthleteId, athleteName, DateTimeOffset.UtcNow.AddHours(12).ToUnixTimeSeconds());
    return (IResult)Results.Ok(new { token = SessionToken.Create(session, tokenSecret), user = new { username = user.Username, role = user.Role, athleteName }, expiresInHours = 12 });
});

app.MapGet("/api/auth/me", (HttpContext http) =>
{
    var session = SessionToken.Read(http, tokenSecret);
    return session is null
        ? (IResult)Results.Unauthorized()
        : Results.Ok(new { username = session.Username, role = session.Role, athleteName = session.AthleteName });
});

app.MapGet("/api/admin/athletes", async (HttpContext http, AtletaEmFocoDbContext db) =>
{
    var session = SessionToken.Read(http, tokenSecret);
    if (session is null) return (IResult)Results.Unauthorized();
    if (session.Role is not ("Commission" or "Admin")) return (IResult)Results.StatusCode(403);
    var athletes = await (from athlete in db.Athletes.AsNoTracking()
                          from user in db.AppUsers.AsNoTracking()
                          where user.AthleteId == athlete.AthleteId && user.Role == "Athlete"
                          orderby athlete.FullName
                          select new { athleteId = athlete.AthleteId, name = athlete.FullName, username = user.Username, active = user.IsActive })
        .ToListAsync();
    return (IResult)Results.Ok(athletes);
});

app.MapPost("/api/admin/athletes", async (HttpContext http, CreateAthleteRequest request, AtletaEmFocoDbContext db) =>
{
    var session = SessionToken.Read(http, tokenSecret);
    if (session is null) return (IResult)Results.Unauthorized();
    if (session.Role is not ("Commission" or "Admin")) return (IResult)Results.StatusCode(403);
    if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 150 ||
        !ValidCredentials(request.Username, request.Password))
        return (IResult)Results.BadRequest(new { message = "Informe nome, usuário e uma senha com pelo menos 8 caracteres." });

    await using var transaction = await db.Database.BeginTransactionAsync();
    var athlete = new Athlete { FullName = request.Name.Trim() };
    db.Athletes.Add(athlete);
    await db.SaveChangesAsync();
    var user = new AppUser { Username = request.Username.Trim(), PasswordHash = PasswordHash.Create(request.Password), Role = "Athlete", AthleteId = athlete.AthleteId, IsActive = true };
    db.AppUsers.Add(user);
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException) { return (IResult)Results.Conflict(new { message = "Esse usuário já existe. Escolha outro nome de usuário." }); }
    await transaction.CommitAsync();
    return (IResult)Results.Json(new { athleteId = athlete.AthleteId, name = athlete.FullName, username = user.Username }, statusCode: 201);
});

app.MapGet("/api/admin/training-sessions", async (HttpContext http, AtletaEmFocoDbContext db) =>
{
    var session = SessionToken.Read(http, tokenSecret);
    if (session is null) return (IResult)Results.Unauthorized();
    if (session.Role is not ("Commission" or "Admin")) return (IResult)Results.StatusCode(403);

    var sessions = await db.TrainingSessions.AsNoTracking()
        .OrderByDescending(s => s.StartsAt)
        .Select(s => new { id = s.TrainingSessionId, startsAt = s.StartsAt, sessionType = s.SessionType, description = s.Description })
        .ToListAsync();
    return (IResult)Results.Ok(sessions);
});

app.MapPost("/api/admin/training-sessions", async (HttpContext http, CreateTrainingSessionRequest request, AtletaEmFocoDbContext db) =>
{
    var session = SessionToken.Read(http, tokenSecret);
    if (session is null) return (IResult)Results.Unauthorized();
    if (session.Role is not ("Commission" or "Admin")) return (IResult)Results.StatusCode(403);

    var type = request.SessionType?.Trim();
    if (request.StartsAt == default || type is not ("Training" or "Match") ||
        (request.Description?.Trim().Length ?? 0) > 250)
        return (IResult)Results.BadRequest(new { message = "Informe data e hora, tipo de sessão válido e descrição de até 250 caracteres." });

    var trainingSession = new TrainingSession
    {
        StartsAt = DateTime.SpecifyKind(request.StartsAt, DateTimeKind.Unspecified),
        SessionType = type,
        Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim()
    };
    db.TrainingSessions.Add(trainingSession);
    await db.SaveChangesAsync();
    return (IResult)Results.Json(new { id = trainingSession.TrainingSessionId, startsAt = trainingSession.StartsAt,
        sessionType = trainingSession.SessionType, description = trainingSession.Description }, statusCode: 201);
});

app.MapGet("/api/athlete/training-sessions", async (HttpContext http, AtletaEmFocoDbContext db) =>
{
    var session = SessionToken.Read(http, tokenSecret);
    if (session is null) return (IResult)Results.Unauthorized();
    if (session.Role != "Athlete" || session.AthleteId is null) return (IResult)Results.StatusCode(403);

    var sessions = await db.TrainingSessions.AsNoTracking()
        .OrderByDescending(s => s.StartsAt)
        .Select(s => new { id = s.TrainingSessionId, startsAt = s.StartsAt, sessionType = s.SessionType, description = s.Description })
        .ToListAsync();
    var existing = await db.Evaluations.AsNoTracking()
        .Where(e => e.AthleteId == session.AthleteId && e.TrainingSessionId != null)
        .Select(e => new { e.TrainingSessionId, e.EvaluationType })
        .ToListAsync();
    var submitted = existing.Select(e => $"{e.TrainingSessionId}:{e.EvaluationType}").ToHashSet(StringComparer.Ordinal);

    return (IResult)Results.Ok(sessions.Select(s => new
    {
        s.id,
        s.startsAt,
        s.sessionType,
        s.description,
        preSubmitted = submitted.Contains($"{s.id}:Pre"),
        postSubmitted = submitted.Contains($"{s.id}:Post")
    }));
});

app.MapGet("/api/evaluations", async (HttpContext http, AtletaEmFocoDbContext db) =>
{
    var session = SessionToken.Read(http, tokenSecret);
    if (session is null) return (IResult)Results.Unauthorized();
    if (session.Role is not ("Commission" or "Admin")) return (IResult)Results.StatusCode(403);

    var evaluations = await db.Evaluations.AsNoTracking().OrderByDescending(e => e.SubmittedAt).ToListAsync();
    var athleteIds = evaluations.Select(e => e.AthleteId).Distinct().ToArray();
    var athleteNames = await db.Athletes.AsNoTracking().Where(a => athleteIds.Contains(a.AthleteId))
        .ToDictionaryAsync(a => a.AthleteId, a => a.FullName);
    var trainingSessionIds = evaluations.Where(e => e.TrainingSessionId.HasValue).Select(e => e.TrainingSessionId!.Value).Distinct().ToArray();
    var trainingSessions = await db.TrainingSessions.AsNoTracking().Where(s => trainingSessionIds.Contains(s.TrainingSessionId))
        .ToDictionaryAsync(s => s.TrainingSessionId, s => new { s.StartsAt, s.SessionType, s.Description });
    var result = new List<object>();

    foreach (var evaluation in evaluations)
    {
        var athleteName = athleteNames.GetValueOrDefault(evaluation.AthleteId) ?? $"Atleta {evaluation.AthleteId}";
        var sessionInfo = evaluation.TrainingSessionId is int trainingSessionId && trainingSessions.TryGetValue(trainingSessionId, out var foundSession)
            ? new { id = trainingSessionId, startsAt = foundSession.StartsAt, sessionType = foundSession.SessionType, description = foundSession.Description }
            : null;
        if (evaluation.EvaluationType == "Pre")
        {
            var pre = await db.PreTrainingResponses.AsNoTracking().FirstOrDefaultAsync(p => p.EvaluationId == evaluation.EvaluationId);
            if (pre is null) continue;
            var regions = await db.PainRegions.AsNoTracking().Where(p => p.EvaluationId == evaluation.EvaluationId).Select(p => p.RegionCode).ToListAsync();
            result.Add(new { id = evaluation.EvaluationId, type = "Pré-treino", athlete = athleteName, timestamp = evaluation.SubmittedAt, trainingSession = sessionInfo,
                recuperacao = (int)pre.Recovery, sonoHoras = pre.SleepHours, sonoQualidade = (int)pre.SleepQuality,
                estresse = (int)pre.Stress, fadiga = (int)pre.MuscleFatigue, hidratacao = (int)pre.Hydration,
                regioes = regions, semDor = pre.NoPain, esforco = (int?)null, duracao = (int?)null });
        }
        else if (evaluation.EvaluationType == "Post")
        {
            var post = await db.PostTrainingResponses.AsNoTracking().FirstOrDefaultAsync(p => p.EvaluationId == evaluation.EvaluationId);
            if (post is null) continue;
            result.Add(new { id = evaluation.EvaluationId, type = "Pós-treino", athlete = athleteName, timestamp = evaluation.SubmittedAt, trainingSession = sessionInfo,
                recuperacao = (int?)null, sonoHoras = (decimal?)null, sonoQualidade = (int?)null, estresse = (int?)null,
                fadiga = (int?)null, hidratacao = (int?)null, regioes = Array.Empty<string>(), semDor = (bool?)null,
                esforco = (int)post.Effort, duracao = (int)post.DurationMinutes });
        }
    }
    return (IResult)Results.Ok(result);
});

app.MapPost("/api/evaluations/pre", async (HttpContext http, PreTrainingRequest request, AtletaEmFocoDbContext db) =>
{
    var session = SessionToken.Read(http, tokenSecret);
    if (session is null) return (IResult)Results.Unauthorized();
    if (session.Role != "Athlete" || session.AthleteId is null) return (IResult)Results.StatusCode(403);
    if (request.TrainingSessionId < 1 || !await db.TrainingSessions.AnyAsync(s => s.TrainingSessionId == request.TrainingSessionId))
        return (IResult)Results.BadRequest(new { message = "Selecione uma sessão de treino válida." });

    var regions = request.PainRegions ?? [];
    var validRegions = new HashSet<string>(StringComparer.Ordinal)
    { "head", "neck", "shoulderL", "shoulderR", "armL", "armR", "elbowL", "elbowR", "wristL", "wristR", "chest", "back", "abdomen", "hipL", "hipR", "thighL", "thighR", "kneeL", "kneeR", "calfL", "calfR", "ankleL", "ankleR", "handL", "handR", "footL", "footR" };

    if (request.Recovery is < 1 or > 10 || request.SleepHours is < 0 or > 24 || request.SleepQuality is < 1 or > 7 ||
        request.Stress is < 1 or > 7 || request.MuscleFatigue is < 1 or > 7 || request.Hydration is < 1 or > 8)
        return (IResult)Results.BadRequest(new { message = "Uma ou mais respostas estão fora dos limites permitidos." });
    if ((request.NoPain && regions.Count > 0) || (!request.NoPain && regions.Count == 0))
        return (IResult)Results.BadRequest(new { message = "Marque sem dor ou selecione pelo menos uma região de dor." });
    if (regions.Any(region => !validRegions.Contains(region)))
        return (IResult)Results.BadRequest(new { message = "Uma ou mais regiões informadas não são válidas." });

    var alreadySubmitted = await db.Evaluations.AnyAsync(e => e.AthleteId == session.AthleteId &&
        e.TrainingSessionId == request.TrainingSessionId && e.EvaluationType == "Pre");
    if (alreadySubmitted)
        return (IResult)Results.Conflict(new { message = "Você já enviou a avaliação pré-treino desta sessão." });

    await using var transaction = await db.Database.BeginTransactionAsync();
    var evaluation = new Evaluation { AthleteId = session.AthleteId.Value, SubmittedByUserId = session.UserId, TrainingSessionId = request.TrainingSessionId, EvaluationType = "Pre", SubmittedAt = DateTime.UtcNow };
    db.Evaluations.Add(evaluation);
    try
    {
        await db.SaveChangesAsync();
        db.PreTrainingResponses.Add(new PreTrainingResponse { EvaluationId = evaluation.EvaluationId, Recovery = (byte)request.Recovery,
            SleepHours = request.SleepHours, SleepQuality = (byte)request.SleepQuality, Stress = (byte)request.Stress,
            MuscleFatigue = (byte)request.MuscleFatigue, Hydration = (byte)request.Hydration, NoPain = request.NoPain });
        foreach (var region in regions.Distinct()) db.PainRegions.Add(new PainRegion { EvaluationId = evaluation.EvaluationId, RegionCode = region });
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException)
    {
        await transaction.RollbackAsync();
        return (IResult)Results.Conflict(new { message = "Você já enviou a avaliação pré-treino desta sessão." });
    }
    await transaction.CommitAsync();
    return (IResult)Results.Json(new { message = "Avaliação pré-treino salva no banco.", evaluationId = evaluation.EvaluationId }, statusCode: 201);
});

app.MapPost("/api/evaluations/post", async (HttpContext http, PostTrainingRequest request, AtletaEmFocoDbContext db) =>
{
    var session = SessionToken.Read(http, tokenSecret);
    if (session is null) return (IResult)Results.Unauthorized();
    if (session.Role != "Athlete" || session.AthleteId is null) return (IResult)Results.StatusCode(403);
    if (request.TrainingSessionId < 1 || !await db.TrainingSessions.AnyAsync(s => s.TrainingSessionId == request.TrainingSessionId))
        return (IResult)Results.BadRequest(new { message = "Selecione uma sessão de treino válida." });
    if (request.Effort is < 1 or > 10 || request.DurationMinutes is < 1 or > 600)
        return (IResult)Results.BadRequest(new { message = "Esforço deve ser de 1 a 10 e duração de 1 a 600 minutos." });

    var alreadySubmitted = await db.Evaluations.AnyAsync(e => e.AthleteId == session.AthleteId &&
        e.TrainingSessionId == request.TrainingSessionId && e.EvaluationType == "Post");
    if (alreadySubmitted)
        return (IResult)Results.Conflict(new { message = "Você já enviou a avaliação pós-treino desta sessão." });

    await using var transaction = await db.Database.BeginTransactionAsync();
    var evaluation = new Evaluation { AthleteId = session.AthleteId.Value, SubmittedByUserId = session.UserId, TrainingSessionId = request.TrainingSessionId, EvaluationType = "Post", SubmittedAt = DateTime.UtcNow };
    db.Evaluations.Add(evaluation);
    try
    {
        await db.SaveChangesAsync();
        db.PostTrainingResponses.Add(new PostTrainingResponse { EvaluationId = evaluation.EvaluationId, Effort = (byte)request.Effort, DurationMinutes = (short)request.DurationMinutes });
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException)
    {
        await transaction.RollbackAsync();
        return (IResult)Results.Conflict(new { message = "Você já enviou a avaliação pós-treino desta sessão." });
    }
    await transaction.CommitAsync();
    return (IResult)Results.Json(new { message = "Avaliação pós-treino salva no banco.", evaluationId = evaluation.EvaluationId }, statusCode: 201);
});

app.Run();

static bool ValidCredentials(string? username, string? password) =>
    !string.IsNullOrWhiteSpace(username) && username.Trim().Length <= 254 &&
    !string.IsNullOrWhiteSpace(password) && password.Length >= 8 && password.Length <= 200;

public sealed record SetupRequest(string AthleteUsername, string AthletePassword, string CommissionUsername, string CommissionPassword);
public sealed record LoginRequest(string Username, string Password);
public sealed record CreateAthleteRequest(string Name, string Username, string Password);
public sealed record CreateTrainingSessionRequest(DateTime StartsAt, string? SessionType, string? Description);
public sealed record PreTrainingRequest(int TrainingSessionId, int Recovery, decimal SleepHours, int SleepQuality, int Stress, int MuscleFatigue, int Hydration, bool NoPain, List<string>? PainRegions);
public sealed record PostTrainingRequest(int TrainingSessionId, int Effort, int DurationMinutes);
public sealed record AuthSession(int UserId, string Username, string Role, int? AthleteId, string? AthleteName, long ExpiresAt);

static class PasswordHash
{
    private const int Iterations = 210_000;
    public static string Create(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"pbkdf2-sha256${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }
    public static bool Verify(string password, string stored)
    {
        try
        {
            var parts = stored.Split('$');
            if (parts.Length != 4 || parts[0] != "pbkdf2-sha256" || !int.TryParse(parts[1], out var iterations) || iterations < 100_000) return false;
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch { return false; }
    }
}

static class SessionToken
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public static string Create(AuthSession session, byte[] secret)
    {
        var payload = Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(session, JsonOptions)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var signature = HMACSHA256.HashData(secret, Encoding.UTF8.GetBytes(payload));
        return payload + "." + Convert.ToBase64String(signature).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
    public static AuthSession? Read(HttpContext http, byte[] secret)
    {
        var header = http.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        var parts = header[7..].Split('.');
        if (parts.Length != 2) return null;
        try
        {
            var signature = Decode(parts[1]);
            var expected = HMACSHA256.HashData(secret, Encoding.UTF8.GetBytes(parts[0]));
            if (!CryptographicOperations.FixedTimeEquals(signature, expected)) return null;
            var session = JsonSerializer.Deserialize<AuthSession>(Decode(parts[0]), JsonOptions);
            return session is not null && session.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeSeconds() ? session : null;
        }
        catch { return null; }
    }
    private static byte[] Decode(string value)
    {
        value = value.Replace('-', '+').Replace('_', '/');
        value += new string('=', (4 - value.Length % 4) % 4);
        return Convert.FromBase64String(value);
    }
}
