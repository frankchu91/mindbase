package app.mindbase.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class InboxEntry(
    val id: String,
    val type: String,
    val url: String? = null,
    val title: String? = null,
    val status: String,
    val captured_at: String,
    val captured_via: String,
    val error: String? = null,
    val wiki_slug: String? = null,
)

@Serializable
private data class InboxResponse(val entries: List<InboxEntry>)

@Composable
fun InboxScreen(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var entries by remember { mutableStateOf<List<InboxEntry>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val json = remember { Json { ignoreUnknownKeys = true } }
    val httpClient = remember {
        HttpClient(CIO) {
            install(ContentNegotiation) { json(json) }
            expectSuccess = false
        }
    }

    suspend fun load() {
        loading = true
        error = null
        try {
            val settings = TokenStore.read(ctx)
            val token = settings.token
            val resp = httpClient.get("${settings.serverUrl}/api/inbox") {
                if (token != null) header(HttpHeaders.Authorization, "Bearer $token")
            }
            if (!resp.status.isSuccess()) {
                error = "Server error ${resp.status.value}"
                return
            }
            val body = resp.bodyAsText()
            val parsed = json.decodeFromString(InboxResponse.serializer(), body)
            entries = parsed.entries
        } catch (e: Exception) {
            error = "Failed to load: ${e.message}"
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Inbox") },
                actions = {
                    IconButton(
                        onClick = { scope.launch { load() } },
                        enabled = !loading,
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))

                error != null -> {
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = error ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        OutlinedButton(onClick = { scope.launch { load() } }) {
                            Text("Retry")
                        }
                    }
                }

                entries.isEmpty() -> {
                    Text(
                        text = "Inbox is empty",
                        modifier = Modifier.align(Alignment.Center),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 8.dp),
                    ) {
                        items(entries, key = { it.id }) { entry ->
                            InboxEntryRow(entry)
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InboxEntryRow(entry: InboxEntry) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StatusBadge(entry.status)
            Text(
                text = entry.type,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "via ${entry.captured_via}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = entry.title ?: entry.url ?: "(no title)",
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 2,
        )
        entry.error?.let { err ->
            Text(
                text = err,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                maxLines = 2,
            )
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    val (bgColor, fgColor) = when (status) {
        "queued" -> Color(0xFFFFF9C4) to Color(0xFFF57F17)
        "processing" -> Color(0xFFBBDEFB) to Color(0xFF1565C0)
        "compiled" -> Color(0xFFC8E6C9) to Color(0xFF2E7D32)
        "failed" -> Color(0xFFFFCDD2) to Color(0xFFC62828)
        else -> Color(0xFFEEEEEE) to Color(0xFF616161)
    }
    Surface(
        color = bgColor,
        shape = MaterialTheme.shapes.extraSmall,
    ) {
        Text(
            text = status,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = fgColor,
        )
    }
}
