package com.innovativenovels.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.StaleObjectException;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.Collection;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented acceptance test verifying the Android native reading journey
 * end-to-end through the Android native Capacitor shell on an Android Emulator.
 *
 * Required user journey:
 * 1. Launch the app in an Android Emulator.
 * 2. Reach Catalog.
 * 3. Open 《潮汐之城》 or another stable production fixture.
 * 4. Reach Book Detail.
 * 5. Enter Reader.
 * 6. Verify substantive chapter prose is visible.
 * 7. Navigate to the next chapter using existing product UI.
 * 8. Move materially into the chapter.
 * 9. Terminate/background-and-kill the application using the deterministic mechanism supported by the harness.
 * 10. Relaunch.
 * 11. Verify the application resumes into a valid Reader/session state consistent with the existing persistence contract.
 */
@RunWith(AndroidJUnit4.class)
public class ReadingJourneyInstrumentedTest {

    private static final String TAG = "NovelJourneyTest";
    private static final String PACKAGE_NAME = "com.innovativenovels.app";
    private static final long LAUNCH_TIMEOUT_MS = 25000L;
    private static final long UI_TIMEOUT_MS = 15000L;

    private UiDevice device;

    @Before
    public void setUp() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        assertNotNull("UiDevice instance must be available", device);
    }

    private void captureScreenshot(String name) {
        try {
            File screenshotFile = new File("/sdcard/" + name + ".png");
            device.takeScreenshot(screenshotFile);
        } catch (Exception ignored) {}
    }

    private void dumpHierarchy(String label) {
        try {
            ByteArrayOutputStream os = new ByteArrayOutputStream();
            device.dumpWindowHierarchy(os);
            Log.d(TAG, "=== DUMP [" + label + "] ===\n" + os.toString("UTF-8"));
        } catch (Exception e) {
            Log.e(TAG, "Failed to dump hierarchy: " + e.getMessage());
        }
    }

    private UiObject2 findObjectByTextOrDesc(String regex, long timeoutMs) {
        long startTime = System.currentTimeMillis();
        Pattern pattern = Pattern.compile(regex, Pattern.DOTALL);
        while (System.currentTimeMillis() - startTime < timeoutMs) {
            try {
                UiObject2 obj = device.findObject(By.text(pattern));
                if (obj != null) {
                    return obj;
                }
                obj = device.findObject(By.desc(pattern));
                if (obj != null) {
                    return obj;
                }
                List<UiObject2> textViews = device.findObjects(By.clazz("android.widget.TextView"));
                for (UiObject2 tv : textViews) {
                    String text = tv.getText();
                    if (text != null && pattern.matcher(text).matches()) {
                        return tv;
                    }
                }
            } catch (StaleObjectException ignored) {}
            try {
                Thread.sleep(250L);
            } catch (InterruptedException ignored) {}
        }
        return null;
    }

    private void clickButtonByText(String regex, long timeoutMs, String description) {
        long startTime = System.currentTimeMillis();
        Pattern pattern = Pattern.compile(regex, Pattern.DOTALL);
        while (System.currentTimeMillis() - startTime < timeoutMs) {
            try {
                // Check all Button nodes first
                List<UiObject2> buttons = device.findObjects(By.clazz("android.widget.Button"));
                for (UiObject2 button : buttons) {
                    String text = button.getText();
                    String desc = button.getContentDescription();
                    if ((text != null && pattern.matcher(text).matches()) ||
                        (desc != null && pattern.matcher(desc).matches())) {
                        button.click();
                        device.waitForIdle();
                        return;
                    }
                }

                // Check clickable nodes matching text or desc
                UiObject2 clickableObj = device.findObject(By.text(pattern).clickable(true));
                if (clickableObj == null) {
                    clickableObj = device.findObject(By.desc(pattern).clickable(true));
                }
                if (clickableObj != null) {
                    clickableObj.click();
                    device.waitForIdle();
                    return;
                }

                // Check any matching node
                UiObject2 anyObj = device.findObject(By.text(pattern));
                if (anyObj == null) {
                    anyObj = device.findObject(By.desc(pattern));
                }
                if (anyObj != null) {
                    anyObj.click();
                    device.waitForIdle();
                    return;
                }
            } catch (StaleObjectException ignored) {}
            try {
                Thread.sleep(250L);
            } catch (InterruptedException ignored) {}
        }
        dumpHierarchy("FAIL_CLICK_" + description);
        assertTrue("Timeout finding/clicking button " + description + " matching pattern: " + regex, false);
    }

    private void launchApp() {
        Context targetContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent launchIntent = targetContext.getPackageManager().getLaunchIntentForPackage(PACKAGE_NAME);
        assertNotNull("Launch intent for " + PACKAGE_NAME + " must exist", launchIntent);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        targetContext.startActivity(launchIntent);

        boolean appStarted = device.wait(Until.hasObject(By.pkg(PACKAGE_NAME).depth(0)), LAUNCH_TIMEOUT_MS);
        assertTrue("App package " + PACKAGE_NAME + " must be in foreground", appStarted);
        device.waitForIdle();
    }

    private void terminateAndBackgroundApp() {
        // Step 9: Deterministically background the application and destroy active UI
        device.pressHome();
        device.waitForIdle();

        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                for (Stage stage : new Stage[]{Stage.STOPPED, Stage.PAUSED, Stage.RESUMED, Stage.CREATED, Stage.STARTED}) {
                    Collection<Activity> activities =
                        ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(stage);
                    for (Activity a : activities) {
                        a.finish();
                    }
                }
            });
        } catch (Exception ignored) {}

        try {
            Thread.sleep(1500L);
        } catch (InterruptedException ignored) {}
    }

    /**
     * Idempotently navigates back to Catalog if the app was launched into a persisted session.
     */
    private void ensureCatalogScreen() {
        UiObject2 catalogHeading = findObjectByTextOrDesc(".*探索故事.*", 3000L);
        if (catalogHeading != null) {
            return;
        }

        try {
            UiObject2 backToBook = findObjectByTextOrDesc(".*(返回作品|返回).*", 2000L);
            if (backToBook != null) {
                backToBook.click();
                device.waitForIdle();
            }
        } catch (Exception ignored) {}

        try {
            UiObject2 backToCatalog = findObjectByTextOrDesc(".*(返回書庫|返回我的書架).*", 2000L);
            if (backToCatalog != null) {
                backToCatalog.click();
                device.waitForIdle();
            }
        } catch (Exception ignored) {}

        UiObject2 finalCatalogHeading = findObjectByTextOrDesc(".*探索故事.*", UI_TIMEOUT_MS);
        assertNotNull("Step 2: Failed to reach Catalog screen ('探索故事')", finalCatalogHeading);
    }

    @Test
    public void testNativeReadingJourney() throws Exception {
        // Step 1: Launch the app in an Android Emulator
        launchApp();
        captureScreenshot("01_AppLaunch");

        // Step 2: Reach Catalog
        ensureCatalogScreen();
        UiObject2 catalogHeading = findObjectByTextOrDesc(".*探索故事.*", UI_TIMEOUT_MS);
        assertNotNull("Step 2: Catalog heading '探索故事' not visible", catalogHeading);
        captureScreenshot("02_CatalogReached");

        // Step 3: Open one known production book (e.g. 潮汐之城)
        clickButtonByText(".*(閱讀焦點作品|開啟作品|查看書籍|潮汐之城).*", UI_TIMEOUT_MS, "Open Book Button");
        captureScreenshot("03_BookClicked");

        // Step 4: Reach Book Detail
        UiObject2 bookDetailTitle = findObjectByTextOrDesc(".*潮汐之城.*", UI_TIMEOUT_MS);
        assertNotNull("Step 4: Book detail title '潮汐之城' not visible", bookDetailTitle);
        captureScreenshot("04_BookDetailOpened");

        // Step 5: Enter Reader
        clickButtonByText(".*(開始閱讀|繼續閱讀|閱讀本章).*", UI_TIMEOUT_MS, "Enter Reader Button");
        captureScreenshot("05_ReaderEntered");

        // Step 6: Verify substantive chapter prose is visible
        UiObject2 chapter1Heading = findObjectByTextOrDesc(".*(第一章|潮聲來信).*", UI_TIMEOUT_MS);
        assertNotNull("Step 6: Chapter 1 heading not visible in Reader", chapter1Heading);

        UiObject2 chapter1Prose = findObjectByTextOrDesc(".*(燈火|澄夏|潮聲).*", UI_TIMEOUT_MS);
        assertNotNull("Step 6: Substantive chapter prose not visible in Reader", chapter1Prose);
        captureScreenshot("06_Chapter1ProseVisible");

        // Step 7: Navigate to the next chapter using existing product UI
        clickButtonByText(".*(下一章|下章|繼續閱讀：第二章|繼續閱讀).*", UI_TIMEOUT_MS, "Next Chapter Button");

        UiObject2 chapter2Heading = findObjectByTextOrDesc(".*(第二章|舊燈塔).*", UI_TIMEOUT_MS);
        assertNotNull("Step 7: Chapter 2 heading not visible after navigating to next chapter", chapter2Heading);
        captureScreenshot("07_Chapter2Navigated");

        // Step 8: Move materially into the chapter
        int width = device.getDisplayWidth();
        int height = device.getDisplayHeight();
        // Swipe up to scroll down into the chapter content
        device.swipe(width / 2, (int) (height * 0.75), width / 2, (int) (height * 0.25), 15);
        device.waitForIdle();
        Thread.sleep(500L);

        UiObject2 chapter2Prose = findObjectByTextOrDesc(".*(舊燈塔|燈室|頂層|鹽霧).*", UI_TIMEOUT_MS);
        assertNotNull("Step 8: Chapter 2 prose not visible after moving materially into chapter", chapter2Prose);
        captureScreenshot("08_MovedMateriallyIntoChapter2");

        // Step 9: Terminate/background-and-kill the application using the deterministic mechanism supported by the harness
        terminateAndBackgroundApp();

        // Step 10: Relaunch
        launchApp();
        captureScreenshot("10_AppRelaunched");
        Thread.sleep(1000L);
        dumpHierarchy("STEP11_AFTER_RELAUNCH");

        // Step 11: Verify the application resumes into a valid Reader/session state consistent with the existing persistence contract
        UiObject2 resumeStateIndicator = findObjectByTextOrDesc(".*(已恢復上次閱讀|第二章|舊燈塔|頂層|燈室|本章閱讀進度|閱讀器).*", UI_TIMEOUT_MS);
        if (resumeStateIndicator == null) {
            dumpHierarchy("STEP11_FAILED_INDICATOR");
        }
        assertNotNull("Step 11: Application did not resume to valid reading state on Chapter 2", resumeStateIndicator);


        UiObject2 resumedProse = findObjectByTextOrDesc(".*(舊燈塔|燈室|澄夏|頂層|鹽霧).*", UI_TIMEOUT_MS);
        assertNotNull("Step 11: Resumed chapter prose not visible after relaunch", resumedProse);
        captureScreenshot("11_ResumeStateVerified");
    }
}
