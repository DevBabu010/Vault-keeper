package expo.modules.vaultkeeperpbkdf2

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class VaultKeeperPbkdf2Module : Module() {
  override fun definition() = ModuleDefinition {
    Name("VaultKeeperPbkdf2")

    AsyncFunction("deriveKeyAsync") {
        password: String,
        saltBase64: String,
        iterations: Int,
        keyLength: Int ->
      require(iterations > 0) { "iterations must be positive" }
      require(keyLength > 0) { "keyLength must be positive" }

      val salt = Base64.decode(saltBase64, Base64.NO_WRAP)
      val passwordSpec = PBEKeySpec(password.toCharArray(), salt, iterations, keyLength * 8)
      try {
        val key = SecretKeyFactory
          .getInstance("PBKDF2WithHmacSHA256")
          .generateSecret(passwordSpec)
          .encoded
        Base64.encodeToString(key, Base64.NO_WRAP)
      } finally {
        passwordSpec.clearPassword()
      }
    }
  }
}
