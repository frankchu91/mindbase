package app.mindbase.android

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var settings by remember { mutableStateOf(Settings()) }
    var showPairing by remember { mutableStateOf(false) }
    var showUnpairConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(showPairing) {
        // Reload settings whenever pairing screen is dismissed
        if (!showPairing) {
            settings = TokenStore.read(ctx)
        }
    }

    if (showPairing) {
        PairingScreen(
            modifier = modifier,
            onPaired = {
                showPairing = false
            },
        )
        return
    }

    if (showUnpairConfirm) {
        AlertDialog(
            onDismissRequest = { showUnpairConfirm = false },
            title = { Text("Unpair device?") },
            text = { Text("This removes the stored token. You'll need to pair again to capture from this device.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showUnpairConfirm = false
                        scope.launch {
                            TokenStore.write(ctx, settings.serverUrl, null, null)
                            settings = TokenStore.read(ctx)
                        }
                    },
                ) {
                    Text("Unpair", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showUnpairConfirm = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall)

        HorizontalDivider()

        // Pairing status card
        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Pairing status", style = MaterialTheme.typography.titleMedium)

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val isPaired = settings.token != null
                    Surface(
                        color = if (isPaired)
                            MaterialTheme.colorScheme.primaryContainer
                        else
                            MaterialTheme.colorScheme.errorContainer,
                        shape = MaterialTheme.shapes.small,
                    ) {
                        Text(
                            text = if (isPaired) "Paired" else "Not paired",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (isPaired)
                                MaterialTheme.colorScheme.onPrimaryContainer
                            else
                                MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }

                Text(
                    text = "Server: ${settings.serverUrl}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                settings.deviceId?.let {
                    Text(
                        text = "Device ID: $it",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Button(
            onClick = { showPairing = true },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (settings.token != null) "Re-pair this device" else "Pair this device")
        }

        if (settings.token != null) {
            OutlinedButton(
                onClick = { showUnpairConfirm = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.error,
                ),
            ) {
                Text("Unpair")
            }
        }

        Spacer(Modifier.weight(1f))

        Text(
            text = "MindBase Android v0.1.0",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )
    }
}
