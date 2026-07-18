package app.mindbase.android

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * Transparent activity that handles ACTION_SEND intents (text and images)
 * and forwards them to the MindBase server via APIClient, then finishes immediately.
 *
 * Declared in AndroidManifest.xml with android:theme="@android:style/Theme.NoDisplay"
 * so nothing is rendered to screen — the user only sees the brief "Saved to MindBase" toast.
 */
class ShareReceiverActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent?.action != Intent.ACTION_SEND) {
            finish()
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val client = APIClient(this@ShareReceiverActivity)
                val mime = intent.type.orEmpty()

                when {
                    mime.startsWith("text/") -> {
                        val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                        val title = intent.getStringExtra(Intent.EXTRA_SUBJECT)
                        val isUrl = text.startsWith("http://") || text.startsWith("https://")
                        if (isUrl) {
                            client.capture(
                                type = "url",
                                url = text,
                                title = title,
                                clientDedupKey = "share-android:url:$text",
                            )
                        } else {
                            client.capture(
                                type = "text",
                                title = title,
                                text = text,
                                clientDedupKey = "share-android:text:${text.take(64)}",
                            )
                        }
                    }

                    mime.startsWith("image/") -> {
                        @Suppress("DEPRECATION")
                        val uri: Uri? = if (android.os.Build.VERSION.SDK_INT >= 33) {
                            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                        } else {
                            intent.getParcelableExtra(Intent.EXTRA_STREAM)
                        }

                        if (uri != null) {
                            val ext = when {
                                mime.contains("png") -> ".png"
                                else -> ".jpg"
                            }
                            val tmp = File.createTempFile("share-", ext, cacheDir)
                            contentResolver.openInputStream(uri)?.use { inp ->
                                FileOutputStream(tmp).use { out -> inp.copyTo(out) }
                            }
                            try {
                                client.capture(
                                    type = "image",
                                    title = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: "Shared image",
                                    file = tmp,
                                    clientDedupKey = "share-android:image:$uri",
                                )
                            } finally {
                                tmp.delete()
                            }
                        }
                    }

                    else -> {
                        // Unsupported MIME type — silently finish
                    }
                }

                withContext(Dispatchers.Main) {
                    Toast.makeText(this@ShareReceiverActivity, "Saved to MindBase", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    val msg = when {
                        e.message?.contains("Not paired") == true ->
                            "Open MindBase app → Settings → Pair this device first"
                        else -> "Failed: ${e.message}"
                    }
                    Toast.makeText(this@ShareReceiverActivity, msg, Toast.LENGTH_LONG).show()
                }
            } finally {
                withContext(Dispatchers.Main) {
                    finish()
                }
            }
        }
    }
}
