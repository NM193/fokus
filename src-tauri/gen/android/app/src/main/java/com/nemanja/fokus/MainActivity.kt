package com.nemanja.fokus

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  /** Where the phone's bars end, in CSS pixels: "top right bottom left". Empty till Android says. */
  @Volatile private var insets = ""

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // The page is drawn under the status bar and the gesture bar, and the web
  // view's env(safe-area-inset-*) leaves out the gesture bar: so the page
  // asks here (src/lib/insets.ts), and hears when they change. Added before
  // the page loads, which an interface needs.
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun get(): String = insets
    }, "FokusInsets")

    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, all ->
      val bars = all.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val px = view.resources.displayMetrics.density
      insets = listOf(bars.top, bars.right, bars.bottom, bars.left).joinToString(" ") { "${it / px}" }
      view.post { webView.evaluateJavascript("dispatchEvent(new Event('fokus-insets'))", null) }
      // The web view still does its own with them.
      ViewCompat.onApplyWindowInsets(view, all)
    }
  }
}
