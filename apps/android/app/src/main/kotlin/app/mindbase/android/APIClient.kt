package app.mindbase.android

import android.content.Context
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.time.Instant

class APIClient(private val ctx: Context) {

    private val json = Json { ignoreUnknownKeys = true }

    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json(json) }
        expectSuccess = false
    }

    @Serializable
    data class PairResp(val token: String, val deviceId: String)

    @Serializable
    data class CaptureResp(val id: String, val status: String)

    suspend fun pair(code: String, name: String): PairResp {
        val settings = TokenStore.read(ctx)
        val resp = client.post("${settings.serverUrl}/api/devices/pair") {
            contentType(ContentType.Application.Json)
            setBody(buildJson(mapOf(
                "code" to code,
                "device_name" to name,
                "device_type" to "android",
            )))
        }
        if (!resp.status.isSuccess()) error("Pair failed: ${resp.status} ${resp.bodyAsText()}")
        return json.decodeFromString(PairResp.serializer(), resp.bodyAsText())
    }

    suspend fun capture(
        type: String,
        url: String? = null,
        title: String? = null,
        text: String? = null,
        note: String? = null,
        file: File? = null,
        clientDedupKey: String? = null,
    ): CaptureResp {
        val settings = TokenStore.read(ctx)
        val token = settings.token ?: error("Not paired — go to Settings to pair this device")
        val server = settings.serverUrl

        val payloadJson = buildJson(buildMap {
            put("type", type)
            put("captured_via", "android")
            put("captured_at", Instant.now().toString())
            url?.let { put("url", it) }
            title?.let { put("title", it) }
            text?.let { put("text", it) }
            note?.let { put("note", it) }
            clientDedupKey?.let { put("client_dedup_key", it) }
        })

        val resp = if (file != null) {
            val fileBytes = file.readBytes()
            val fileName = file.name
            val mime = when {
                type == "audio" -> "audio/mp4"
                type == "image" && fileName.endsWith(".png", ignoreCase = true) -> "image/png"
                type == "image" -> "image/jpeg"
                else -> "application/octet-stream"
            }
            client.post("$server/api/capture") {
                header(HttpHeaders.Authorization, "Bearer $token")
                setBody(MultiPartFormDataContent(formData {
                    append("payload", payloadJson)
                    append("file", fileBytes, Headers.build {
                        append(HttpHeaders.ContentType, mime)
                        append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                    })
                }))
            }
        } else {
            client.post("$server/api/capture") {
                header(HttpHeaders.Authorization, "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(payloadJson)
            }
        }

        if (!resp.status.isSuccess()) error("Capture failed: ${resp.status} ${resp.bodyAsText()}")
        return json.decodeFromString(CaptureResp.serializer(), resp.bodyAsText())
    }

    // Small hand-rolled JSON serializer for mixed-type maps (avoids boxing issues with
    // kotlinx.serialization JsonObject builder on generic Any? maps).
    private fun buildJson(map: Map<String, Any?>): String {
        val sb = StringBuilder("{")
        var first = true
        for ((k, v) in map) {
            if (v == null) continue
            if (!first) sb.append(",")
            first = false
            sb.append("\"").append(escape(k)).append("\":")
            when (v) {
                is String -> sb.append("\"").append(escape(v)).append("\"")
                is Number, is Boolean -> sb.append(v)
                else -> sb.append("\"").append(escape(v.toString())).append("\"")
            }
        }
        sb.append("}")
        return sb.toString()
    }

    private fun escape(s: String): String =
        s.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
}
