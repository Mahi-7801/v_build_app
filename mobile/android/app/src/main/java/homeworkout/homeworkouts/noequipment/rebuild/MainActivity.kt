package homeworkout.homeworkouts.noequipment.rebuild

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // Required by react-native-screens to prevent crashes on state restore
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "homeworkout"

  /**
   * Returns the instance of the [ReactActivityDelegate]. Wrapped with
   * [ReactActivityDelegateWrapper] to enable Expo modules integration.
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      ReactActivityDelegateWrapper(
          this,
          DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
      )
}
