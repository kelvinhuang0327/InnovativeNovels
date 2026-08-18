import XCTest

final class AppUITests: XCTestCase {

    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDownWithError() throws {
        if let app = app, app.state == .runningForeground {
            let screenshot = XCUIScreen.main.screenshot()
            let attachment = XCTAttachment(screenshot: screenshot)
            attachment.lifetime = .keepAlways
            attachment.name = "FinalState_\(name)"
            add(attachment)
        }
        app = nil
    }

    private func attachScreenshot(name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.lifetime = .keepAlways
        attachment.name = name
        add(attachment)
    }

    /// Idempotently navigates back to Catalog screen if the app booted into a persisted reading session.
    private func ensureCatalogScreen() {
        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 20.0), "WebView failed to load")

        let catalogHeading = app.staticTexts["探索故事"]
        if catalogHeading.waitForExistence(timeout: 3.0) {
            return
        }

        // If in Reader screen, tap back to Book Detail
        let backToBook = app.buttons.matching(NSPredicate(format: "label == '返回作品' OR label == '返回'")).firstMatch
        if backToBook.waitForExistence(timeout: 5.0) {
            backToBook.tap()
        }

        // Ensure top of page is visible
        webView.swipeDown()

        // If in Book Detail screen, tap back to Catalog
        let backToCatalog = app.buttons.matching(NSPredicate(format: "label == '返回書庫' OR label == '返回我的書架'")).firstMatch
        if backToCatalog.waitForExistence(timeout: 5.0) {
            backToCatalog.tap()
        }

        XCTAssertTrue(catalogHeading.waitForExistence(timeout: 15.0), "Step 2: Failed to reach Catalog screen")
    }

    /// Complete automated iOS native reading acceptance journey proving the Novel reading
    /// product works end-to-end through the native iOS shell.
    ///
    /// Required user journey:
    /// 1. Launch the app in an iOS Simulator.
    /// 2. Reach Catalog.
    /// 3. Open one known production book.
    /// 4. Open Book Detail.
    /// 5. Enter Reader.
    /// 6. Verify substantive chapter prose is visible.
    /// 7. Navigate to another chapter using the existing product UI.
    /// 8. Move materially into the chapter.
    /// 9. Leave/terminate the application in the manner supported by the harness.
    /// 10. Relaunch.
    /// 11. Verify the application returns to a valid reading/resume state consistent with the existing persistence contract.
    func testNativeReadingJourney() throws {
        // Step 1: Launch the app in an iOS Simulator
        app.launch()
        attachScreenshot(name: "01_AppLaunch")

        // Step 2: Reach Catalog
        ensureCatalogScreen()
        let catalogHeading = app.staticTexts["探索故事"]
        XCTAssertTrue(catalogHeading.waitForExistence(timeout: 15.0), "Step 2: Catalog heading '探索故事' not visible")
        attachScreenshot(name: "02_CatalogReached")

        // Step 3: Open one known production book (e.g. 潮汐之城)
        let bookButton = app.buttons.matching(NSPredicate(format: "label == '查看書籍' OR label == '開啟作品' OR label == '閱讀焦點作品'")).firstMatch
        XCTAssertTrue(bookButton.waitForExistence(timeout: 10.0), "Step 3: Action button to open book not found on Catalog")
        bookButton.tap()

        // Step 4: Open Book Detail
        let bookDetailTitle = app.staticTexts["潮汐之城"]
        XCTAssertTrue(bookDetailTitle.waitForExistence(timeout: 10.0), "Step 4: Book detail title '潮汐之城' not visible")
        attachScreenshot(name: "04_BookDetailOpened")

        // Step 5: Enter Reader
        let chapter1Button = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] '第一章'")).firstMatch
        if chapter1Button.waitForExistence(timeout: 5.0) {
            chapter1Button.tap()
        } else {
            let readButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "閱讀")).firstMatch
            XCTAssertTrue(readButton.waitForExistence(timeout: 10.0), "Step 5: Start/Continue reading button not found on Book Detail")
            readButton.tap()
        }

        // Step 6: Verify substantive chapter prose is visible
        let chapter1Heading = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "第一章")).firstMatch
        XCTAssertTrue(chapter1Heading.waitForExistence(timeout: 10.0), "Step 6: Chapter 1 heading not visible in Reader")

        let proseExcerpt = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] '燈火' OR label CONTAINS[c] '澄夏' OR label CONTAINS[c] '潮聲'")).firstMatch
        XCTAssertTrue(proseExcerpt.waitForExistence(timeout: 10.0), "Step 6: Substantive chapter prose not visible in Reader")
        attachScreenshot(name: "06_Chapter1ProseVisible")

        // Step 7: Navigate to another chapter using the existing product UI
        let nextChapterButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] '下章' OR label CONTAINS[c] '下一章'")).firstMatch
        XCTAssertTrue(nextChapterButton.waitForExistence(timeout: 10.0), "Step 7: Next chapter navigation button not found in Reader chrome")
        nextChapterButton.tap()

        let chapter2Heading = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "第二章")).firstMatch
        XCTAssertTrue(chapter2Heading.waitForExistence(timeout: 10.0), "Step 7: Chapter 2 heading not visible after navigating to next chapter")
        attachScreenshot(name: "07_Chapter2Navigated")

        // Step 8: Move materially into the chapter
        let webView = app.webViews.firstMatch
        webView.swipeUp()

        let chapter2Prose = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] '舊燈塔' OR label CONTAINS[c] '燈室' OR label CONTAINS[c] '鹽霧' OR label CONTAINS[c] '頂層'")).firstMatch
        XCTAssertTrue(chapter2Prose.waitForExistence(timeout: 10.0), "Step 8: Chapter 2 prose not visible after moving materially into chapter")
        attachScreenshot(name: "08_MovedMateriallyIntoChapter2")

        // Step 9: Leave/terminate the application in the manner supported by the harness
        app.terminate()
        XCTAssertEqual(app.state, .notRunning, "Step 9: Application did not terminate properly")

        // Step 10: Relaunch
        app.launch()
        let relaunchedWebView = app.webViews.firstMatch
        XCTAssertTrue(relaunchedWebView.waitForExistence(timeout: 20.0), "Step 10: WebView failed to load after relaunch")

        // Step 11: Verify the application returns to a valid reading/resume state consistent with the existing persistence contract
        let resumedIndicator = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] '已恢復上次閱讀' OR label CONTAINS[c] '第二章'")).firstMatch
        XCTAssertTrue(resumedIndicator.waitForExistence(timeout: 15.0), "Step 11: Application did not resume to valid reading state on Chapter 2")

        let resumedProse = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] '舊燈塔' OR label CONTAINS[c] '燈室' OR label CONTAINS[c] '澄夏' OR label CONTAINS[c] '頂層'")).firstMatch
        XCTAssertTrue(resumedProse.waitForExistence(timeout: 10.0), "Step 11: Resumed chapter prose not visible after relaunch")

        XCTAssertEqual(app.state, .runningForeground, "Step 11: Application should be running in foreground after relaunch")
        attachScreenshot(name: "11_ResumeStateVerified")
    }
}
