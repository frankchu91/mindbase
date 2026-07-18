package app.mindbase.android

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID

private const val MAX_RECORDING_SECONDS = 120

@Composable
fun VoiceScreen(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var isRecording by remember { mutableStateOf(false) }
    var elapsed by remember { mutableIntStateOf(0) }
    var status by remember { mutableStateOf("") }
    var statusOk by remember { mutableStateOf(false) }
    var recorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var tempFile by remember { mutableStateOf<File?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            // Permission granted — user can tap mic again
            status = "Permission granted — tap the mic to record"
            statusOk = true
        } else {
            status = "Microphone permission denied"
            statusOk = false
        }
    }

    // Cleanup recorder on dispose
    DisposableEffect(Unit) {
        onDispose {
            recorder?.release()
        }
    }

    fun startRecording() {
        val hasPermission = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
        if (!hasPermission) {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }

        val file = File.createTempFile("voice-${UUID.randomUUID()}", ".m4a", ctx.cacheDir)
        tempFile = file

        @Suppress("DEPRECATION")
        val mr = if (Build.VERSION.SDK_INT >= 31) {
            MediaRecorder(ctx)
        } else {
            MediaRecorder()
        }
        mr.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioSamplingRate(44100)
            setAudioChannels(1)
            setAudioEncodingBitRate(96_000)
            setOutputFile(file.absolutePath)
            setMaxDuration(MAX_RECORDING_SECONDS * 1000)
            setOnInfoListener { _, what, _ ->
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
                    // Will be stopped by the LaunchedEffect countdown
                }
            }
            prepare()
            start()
        }
        recorder = mr
        isRecording = true
        elapsed = 0
        status = ""
    }

    fun stopRecording() {
        val mr = recorder ?: return
        val file = tempFile ?: return
        try {
            mr.stop()
        } catch (e: Exception) {
            Log.w("VoiceScreen", "MediaRecorder.stop() threw", e)
        } finally {
            mr.release()
            recorder = null
        }
        isRecording = false
        status = "Uploading..."
        statusOk = false

        scope.launch {
            try {
                val client = APIClient(ctx)
                client.capture(
                    type = "audio",
                    file = file,
                    clientDedupKey = "voice:android:${UUID.randomUUID()}",
                )
                status = "Saved to inbox"
                statusOk = true
            } catch (e: Exception) {
                status = "Upload failed: ${e.message}"
                statusOk = false
                Log.e("VoiceScreen", "Upload failed", e)
            } finally {
                file.delete()
            }
        }
    }

    // Elapsed-time counter + hard 120s cap
    LaunchedEffect(isRecording) {
        if (!isRecording) return@LaunchedEffect
        while (isActive && isRecording) {
            delay(1000)
            elapsed++
            if (elapsed >= MAX_RECORDING_SECONDS) {
                stopRecording()
                break
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Voice Memo",
            style = MaterialTheme.typography.headlineSmall,
        )

        Spacer(Modifier.height(32.dp))

        if (isRecording) {
            val m = elapsed / 60
            val s = elapsed % 60
            Text(
                text = "%d:%02d".format(m, s),
                style = MaterialTheme.typography.displayMedium,
                color = MaterialTheme.colorScheme.error,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Recording — max 2 min",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        } else {
            Spacer(Modifier.height(72.dp))
        }

        Spacer(Modifier.height(24.dp))

        FilledIconButton(
            onClick = {
                if (isRecording) stopRecording() else startRecording()
            },
            modifier = Modifier.size(96.dp),
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = if (isRecording)
                    MaterialTheme.colorScheme.error
                else
                    MaterialTheme.colorScheme.primary,
            ),
        ) {
            Icon(
                imageVector = if (isRecording) Icons.Default.Stop else Icons.Default.Mic,
                contentDescription = if (isRecording) "Stop recording" else "Start recording",
                modifier = Modifier.size(48.dp),
            )
        }

        Spacer(Modifier.height(16.dp))

        Text(
            text = if (isRecording) "Tap to stop and upload" else "Tap to record",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (status.isNotEmpty()) {
            Spacer(Modifier.height(24.dp))
            Text(
                text = status,
                style = MaterialTheme.typography.bodyMedium,
                color = if (statusOk) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
        }
    }
}
