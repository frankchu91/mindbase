package app.mindbase.android

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.dataStore by preferencesDataStore("mindbase")

data class Settings(
    val serverUrl: String = "http://10.0.2.2:4321",
    val token: String? = null,
    val deviceId: String? = null,
)

object TokenStore {
    private val SERVER_URL = stringPreferencesKey("serverUrl")
    private val TOKEN = stringPreferencesKey("token")
    private val DEVICE_ID = stringPreferencesKey("deviceId")

    suspend fun read(ctx: Context): Settings {
        val prefs = ctx.dataStore.data.first()
        return Settings(
            serverUrl = prefs[SERVER_URL] ?: "http://10.0.2.2:4321",
            token = prefs[TOKEN],
            deviceId = prefs[DEVICE_ID],
        )
    }

    suspend fun write(ctx: Context, serverUrl: String, token: String?, deviceId: String?) {
        ctx.dataStore.edit {
            it[SERVER_URL] = serverUrl
            if (token != null) it[TOKEN] = token else it.remove(TOKEN)
            if (deviceId != null) it[DEVICE_ID] = deviceId else it.remove(DEVICE_ID)
        }
    }
}
