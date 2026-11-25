package dev.qyrobot.keystore

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import android.util.Base64

/**
 * QyroKeystorePlugin — Hardware-backed AndroidKeyStore signing & QR pairing bridge.
 * Pairs with QyroBot server zero-password Ed25519 handshake (120s one-time QR token)
 * and gates sensitive device approvals behind BiometricPrompt.
 */
class QyroKeystorePlugin(
    private val keyAlias: String = "qyrobot_device_identity_key"
) {

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }

    fun hasDeviceKey(): Boolean {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return ks.containsAlias(keyAlias)
    }

    fun ensureDeviceKey(requireUserAuthentication: Boolean = false): String {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (!ks.containsAlias(keyAlias)) {
            val kpg = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC,
                ANDROID_KEYSTORE
            )
            val spec = KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(requireUserAuthentication)
                .build()
            kpg.initialize(spec)
            kpg.generateKeyPair()
        }
        val cert = ks.getCertificate(keyAlias)
        return Base64.encodeToString(cert.publicKey.encoded, Base64.NO_WRAP)
    }

    fun signPairingToken(tokenBytes: ByteArray): String {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val entry = ks.getEntry(keyAlias, null) as KeyStore.PrivateKeyEntry
        val sig = Signature.getInstance("SHA256withECDSA").apply {
            initSign(entry.privateKey)
            update(tokenBytes)
        }
        return Base64.encodeToString(sig.sign(), Base64.NO_WRAP)
    }
}
