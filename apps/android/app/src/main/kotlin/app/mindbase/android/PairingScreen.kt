package app.mindbase.android

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch

private val PAIR_CODE_REGEX = Regex("^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$")

@Composable
fun PairingScreen(
    modifier: Modifier = Modifier,
    onPaired: () -> Unit = {},
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var serverUrl by remember { mutableStateOf("http://10.0.2.2:4321") }
    var deviceName by remember { mutableStateOf(Build.MODEL) }
    var code by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    var statusOk by remember { mutableStateOf(false) }
    var working by remember { mutableStateOf(false) }
    var showScanner by remember { mutableStateOf(false) }

    // Load saved settings on first composition
    LaunchedEffect(Unit) {
        val settings = TokenStore.read(ctx)
        serverUrl = settings.serverUrl
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            showScanner = true
        } else {
            status = "Camera permission denied — cannot scan QR"
            statusOk = false
        }
    }

    fun openScanner() {
        val granted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        if (granted) {
            showScanner = true
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    fun pair() {
        scope.launch {
            working = true
            status = ""
            try {
                // Persist server URL before pairing
                TokenStore.write(ctx, serverUrl, null, null)
                val resp = APIClient(ctx).pair(code.trim(), deviceName.trim())
                TokenStore.write(ctx, serverUrl, resp.token, resp.deviceId)
                status = "Paired successfully"
                statusOk = true
                onPaired()
            } catch (e: Exception) {
                status = "Failed: ${e.message}"
                statusOk = false
            } finally {
                working = false
            }
        }
    }

    if (showScanner) {
        // Full-screen scanner overlay
        Box(modifier = Modifier.fillMaxSize()) {
            QRScannerScreen(
                modifier = Modifier.fillMaxSize(),
                onScanned = { scanned ->
                    code = scanned.uppercase()
                    showScanner = false
                },
            )
            // Dismiss button top-right
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                FilledTonalButton(onClick = { showScanner = false }) {
                    Text("Cancel")
                }
            }
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Pair MindBase", style = MaterialTheme.typography.headlineSmall)

        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("Server URL") },
            placeholder = { Text("http://10.0.2.2:4321") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Uri,
                autoCorrect = false,
            ),
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = deviceName,
            onValueChange = { deviceName = it },
            label = { Text("Device name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = code,
            onValueChange = { code = it.uppercase() },
            label = { Text("Pair code (XXXX-XXXX)") },
            placeholder = { Text("XXXX-XXXX") },
            singleLine = true,
            isError = code.isNotEmpty() && !PAIR_CODE_REGEX.matches(code),
            supportingText = {
                if (code.isNotEmpty() && !PAIR_CODE_REGEX.matches(code)) {
                    Text("Format: 4 chars, dash, 4 chars (e.g. AB12-CD34)")
                }
            },
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                autoCorrect = false,
            ),
            textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace),
            trailingIcon = {
                IconButton(onClick = { openScanner() }) {
                    Icon(Icons.Default.QrCodeScanner, contentDescription = "Scan QR code")
                }
            },
            modifier = Modifier.fillMaxWidth(),
        )

        Button(
            onClick = { pair() },
            enabled = !working && PAIR_CODE_REGEX.matches(code) && serverUrl.isNotBlank() && deviceName.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (working) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
                Spacer(Modifier.width(8.dp))
            }
            Text("Pair this device")
        }

        if (status.isNotEmpty()) {
            Text(
                text = status,
                color = if (statusOk) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

        Text(
            text = "To get a pair code: open your MindBase server in a browser, go to Settings → Devices, and click \"Add device\". Copy the code or scan the QR.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Text(
            text = "Emulator default: http://10.0.2.2:4321 routes to your host machine.\nReal device: use your LAN IP (e.g. http://192.168.1.x:4321) or a cloudflared tunnel.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
