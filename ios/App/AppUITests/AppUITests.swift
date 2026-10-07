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
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.lifetime = .keepAlways
            hierarchy.name = "Hierarchy_\(name)"
            add(hierarchy)
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

    // WebKit exposes dialog triggers as popup controls, not always as Buttons.
    private func readerControl(_ label: String, mobileLabel: String) -> XCUIElement {
        return app.descendants(matching: .any).matching(NSPredicate(format: "label == %@ OR label == %@", label, mobileLabel)).firstMatch
    }

    private func revealReaderChrome(for control: XCUIElement) {
        if control.exists { return }
        // Mobile reading hides the toolbar while scrolling. A tap on prose reveals it.
        let webView = app.webViews.firstMatch
        webView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)).tap()
        if control.waitForExistence(timeout: 3.0) { return }
        webView.swipeDown()
        XCTAssertTrue(control.waitForExistence(timeout: 5.0), "Reader toolbar did not appear after tap/upward scroll")
    }

    private func chapterProgressPercent() throws -> Double {
        let progress = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "本章閱讀進度")).firstMatch
        XCTAssertTrue(progress.waitForExistence(timeout: 5.0))
        let value = try XCTUnwrap(progress.value as? String)
        let number = value.components(separatedBy: CharacterSet.decimalDigits.inverted).first(where: { !$0.isEmpty })
        return try XCTUnwrap(number.flatMap(Double.init), "Chapter progress has no numeric accessibility value")
    }

    private func isVisibleInWebView(_ element: XCUIElement) -> Bool {
        guard element.exists, element.isHittable else { return false }
        let viewport = app.webViews.firstMatch.frame
        return element.frame.midY > viewport.minY + 80 && element.frame.midY < viewport.maxY - 80
    }

    private func scrollToVisible(_ element: XCUIElement, towardTop: Bool) {
        let webView = app.webViews.firstMatch
        for _ in 0..<12 {
            if isVisibleInWebView(element) { return }
            if towardTop { webView.swipeDown() } else { webView.swipeUp() }
        }
        XCTAssertTrue(isVisibleInWebView(element), "Element could not be reached within the visible WebView")
    }

    /// Idempotently navigates back to Catalog screen if the app booted into a persisted reading session.
    private func ensureCatalogScreen() {
        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 20.0), "WebView failed to load")

        let catalogHeading = app.staticTexts["探索故事"]
        for _ in 0..<3 {
            if catalogHeading.waitForExistence(timeout: 3.0) { return }
            let backToCatalog = app.buttons.matching(NSPredicate(format: "label == '返回書庫' OR label == '返回我的書架'")).firstMatch
            if backToCatalog.exists {
                if !backToCatalog.isHittable { webView.swipeDown() }
                backToCatalog.tap()
                continue
            }

            // Reveal the fixed reader header and use a visible return control.
            webView.swipeDown()
            let backToBook = app.buttons.matching(NSPredicate(format: "label == '返回作品'"))
            _ = backToBook.firstMatch.waitForExistence(timeout: 5.0)
            if let visibleBack = backToBook.allElementsBoundByIndex.first(where: { $0.isHittable }) {
                visibleBack.tap()
                _ = backToCatalog.waitForExistence(timeout: 5.0)
            }
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
        let acceptanceNote = "原生閱讀驗收筆記"
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
        XCTAssertTrue(chapter1Button.waitForExistence(timeout: 5.0))
        scrollToVisible(chapter1Button, towardTop: false)
        chapter1Button.tap()

        // Step 6: Verify substantive chapter prose is visible
        let chapter1Heading = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "第一章")).firstMatch
        XCTAssertTrue(chapter1Heading.waitForExistence(timeout: 10.0), "Step 6: Chapter 1 heading not visible in Reader")

        let proseExcerpt = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "清晨的第一道潮聲穿過港口時")).firstMatch
        scrollToVisible(proseExcerpt, towardTop: true)
        XCTAssertTrue(proseExcerpt.waitForExistence(timeout: 10.0), "Step 6: Substantive chapter prose not visible in Reader")
        attachScreenshot(name: "06_Chapter1ProseVisible")

        let settings = readerControl("閱讀設定", mobileLabel: "設定")
        revealReaderChrome(for: settings)
        XCTAssertTrue(settings.waitForExistence(timeout: 10.0))
        settings.tap()
        let darkTheme = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "暗黑")).firstMatch
        XCTAssertTrue(darkTheme.waitForExistence(timeout: 10.0))
        darkTheme.tap()
        XCTAssertTrue(darkTheme.isSelected || (darkTheme.value as? String) == "1", "Dark theme was not selected")
        app.buttons["關閉閱讀設定"].tap()

        let addBookmark = readerControl("加入章節書籤", mobileLabel: "☆")
        if addBookmark.exists { addBookmark.tap() }
        XCTAssertTrue(readerControl("移除章節書籤", mobileLabel: "★").waitForExistence(timeout: 10.0))

        // Step 7: Navigate to another chapter using the existing product UI
        let nextChapterButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] '下章' OR label CONTAINS[c] '下一章'")).firstMatch
        XCTAssertTrue(nextChapterButton.waitForExistence(timeout: 10.0), "Step 7: Next chapter navigation button not found in Reader chrome")
        nextChapterButton.tap()

        let chapter2Heading = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "第二章")).firstMatch
        XCTAssertTrue(chapter2Heading.waitForExistence(timeout: 10.0), "Step 7: Chapter 2 heading not visible after navigating to next chapter")
        attachScreenshot(name: "07_Chapter2Navigated")

        let noteControl = readerControl("本章筆記", mobileLabel: "筆記")
        revealReaderChrome(for: noteControl)
        noteControl.tap()
        let note = app.textViews["筆記內容"]
        XCTAssertTrue(note.waitForExistence(timeout: 10.0))
        if let existing = note.value as? String, !existing.isEmpty {
            // Clear this simulator's synthetic note through the product UI before a repeat run.
            XCTAssertTrue(existing.hasPrefix(acceptanceNote) || existing.hasPrefix("Native acceptance note"), "Unexpected note in the dedicated test simulator")
            app.buttons["清除筆記"].tap()
            XCTAssertFalse(note.waitForExistence(timeout: 2.0))
            revealReaderChrome(for: noteControl)
            noteControl.tap()
            XCTAssertTrue(note.waitForExistence(timeout: 10.0))
        }
        note.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.15)).tap()
        app.typeText(acceptanceNote)
        // Commit text and uncover the save action before tapping it on a software keyboard.
        let noteKeyboardDone = app.buttons["Done"]
        if noteKeyboardDone.waitForExistence(timeout: 3.0) { noteKeyboardDone.tap() }
        XCTAssertEqual(note.value as? String, acceptanceNote, "Note text was not entered before saving")
        app.buttons["儲存筆記"].tap()
        XCTAssertFalse(note.waitForExistence(timeout: 2.0))
        revealReaderChrome(for: noteControl)
        noteControl.tap()
        XCTAssertTrue(note.waitForExistence(timeout: 10.0))
        XCTAssertEqual(note.value as? String, acceptanceNote, "Note was not retained immediately after saving")
        app.buttons["關閉本章筆記"].tap()

        // Step 8: Move materially into the chapter
        let webView = app.webViews.firstMatch
        webView.swipeUp()

        let chapter2Prose = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] '舊燈塔' OR label CONTAINS[c] '燈室' OR label CONTAINS[c] '鹽霧' OR label CONTAINS[c] '頂層'")).firstMatch
        XCTAssertTrue(chapter2Prose.waitForExistence(timeout: 10.0), "Step 8: Chapter 2 prose not visible after moving materially into chapter")
        let savedProgress = try chapterProgressPercent()
        XCTAssertGreaterThan(savedProgress, 0, "Reading did not move into the chapter")
        attachScreenshot(name: "08_MovedMateriallyIntoChapter2")

        // Step 9: Leave/terminate the application in the manner supported by the harness
        app.terminate()
        XCTAssertEqual(app.state, .notRunning, "Step 9: Application did not terminate properly")

        // Step 10: Relaunch
        app.launch()
        let relaunchedWebView = app.webViews.firstMatch
        XCTAssertTrue(relaunchedWebView.waitForExistence(timeout: 20.0), "Step 10: WebView failed to load after relaunch")

        // Step 11: Verify the application returns to a valid reading/resume state consistent with the existing persistence contract
        let resumedIndicator = app.staticTexts["第二章：燈塔守望"].firstMatch
        XCTAssertTrue(resumedIndicator.waitForExistence(timeout: 15.0), "Step 11: Application did not resume to valid reading state on Chapter 2")

        let resumedProse = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] '舊燈塔' OR label CONTAINS[c] '燈室' OR label CONTAINS[c] '澄夏' OR label CONTAINS[c] '頂層'")).firstMatch
        XCTAssertTrue(resumedProse.waitForExistence(timeout: 10.0), "Step 11: Resumed chapter prose not visible after relaunch")
        XCTAssertEqual(try chapterProgressPercent(), savedProgress, accuracy: 2.0, "Chapter position did not survive relaunch")

        XCTAssertEqual(app.state, .runningForeground, "Step 11: Application should be running in foreground after relaunch")
        revealReaderChrome(for: noteControl)
        noteControl.tap()
        let restoredNote = app.textViews["筆記內容"]
        XCTAssertTrue(restoredNote.waitForExistence(timeout: 10.0))
        XCTAssertEqual(restoredNote.value as? String, acceptanceNote)
        app.buttons["關閉本章筆記"].tap()
        readerControl("閱讀設定", mobileLabel: "設定").tap()
        let restoredTheme = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "暗黑")).firstMatch
        XCTAssertTrue(restoredTheme.waitForExistence(timeout: 10.0))
        XCTAssertTrue(restoredTheme.isSelected || (restoredTheme.value as? String) == "1", "Theme did not survive relaunch")
        app.buttons["關閉閱讀設定"].tap()
        readerControl("開啟書籤列表", mobileLabel: "書籤").tap()
        let jumpBookmark = app.buttons["移至章節"]
        XCTAssertTrue(jumpBookmark.waitForExistence(timeout: 10.0))
        jumpBookmark.tap()
        XCTAssertTrue(app.staticTexts["第一章：潮聲來信"].firstMatch.waitForExistence(timeout: 10.0))
        let bookmarked = readerControl("移除章節書籤", mobileLabel: "★")
        revealReaderChrome(for: bookmarked)
        XCTAssertTrue(bookmarked.exists)
        attachScreenshot(name: "11_ResumeStateVerified")
    }

    func testNativeManualAuthoringAvailability() throws {
        app.launch()
        ensureCatalogScreen()
        // Filter the catalog through its public search UI so the footer is nearby.
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10.0))
        search.tap()
        search.typeText("潮汐之城")
        let keyboardDone = app.buttons["Done"]
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 5.0))
        keyboardDone.tap()
        let openAuthoring = app.buttons["開啟創作預覽"]
        XCTAssertTrue(openAuthoring.waitForExistence(timeout: 10.0), "Manual authoring entry is missing")
        for _ in 0..<8 {
            if openAuthoring.isHittable { break }
            app.webViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(openAuthoring.isHittable, "Manual authoring entry could not be reached by scrolling")
        openAuthoring.tap()
        XCTAssertTrue(app.staticTexts["AI 創作預覽"].waitForExistence(timeout: 10.0))
        let unavailableNotice = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "此版本尚未提供內建 AI 生成")).firstMatch
        XCTAssertTrue(unavailableNotice.waitForExistence(timeout: 10.0), "Missing explanation of unavailable generation")
        let preview = app.buttons["產生草稿預覽"]
        XCTAssertTrue(preview.waitForExistence(timeout: 10.0))
        XCTAssertFalse(preview.isEnabled, "Native build must not offer a development-only gateway")
        let importDraft = app.buttons["Import Structured Draft"]
        XCTAssertTrue(importDraft.waitForExistence(timeout: 10.0), "Manual draft import is missing")
        XCTAssertTrue(importDraft.isEnabled)
        attachScreenshot(name: "NativeManualAuthoringAvailability")
    }

    private func assertExportPreview(filename: String) -> String {
        XCTAssertTrue(app.navigationBars["本機匯出預覽"].waitForExistence(timeout: 10.0))
        XCTAssertEqual(app.staticTexts["native-export-filename"].label, filename)
        let text = app.textViews["native-export-content"]
        XCTAssertTrue(text.exists)
        return text.value as? String ?? ""
    }

    private func openLibraryForExport() {
        ensureCatalogScreen()
        let library = app.buttons["我的書架"].firstMatch
        XCTAssertTrue(library.waitForExistence(timeout: 10.0))
        library.tap()
        XCTAssertTrue(app.staticTexts["我的書架"].firstMatch.waitForExistence(timeout: 10.0))
    }

    func testNativeReadingDataExport() throws {
        let syntheticNote = "合成匯出筆記 20261007"
        app.launchArguments = ["-native-export-fail-once"]
        app.launch()
        ensureCatalogScreen()
        let book = app.buttons.matching(NSPredicate(format: "label == '查看書籍' OR label == '閱讀焦點作品'")).firstMatch
        XCTAssertTrue(book.waitForExistence(timeout: 10.0))
        book.tap()
        let chapter = app.buttons.matching(NSPredicate(format: "label CONTAINS '第一章'")).firstMatch
        XCTAssertTrue(chapter.waitForExistence(timeout: 10.0))
        scrollToVisible(chapter, towardTop: false)
        chapter.tap()
        let prose = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '清晨的第一道潮聲穿過港口時'")).firstMatch
        scrollToVisible(prose, towardTop: true)
        let noteControl = readerControl("本章筆記", mobileLabel: "筆記")
        revealReaderChrome(for: noteControl)
        noteControl.tap()
        let note = app.textViews["筆記內容"]
        XCTAssertTrue(note.waitForExistence(timeout: 10.0))
        if let old = note.value as? String, !old.isEmpty {
            XCTAssertEqual(old, syntheticNote, "Only this test's synthetic note may be replaced")
            app.buttons["清除筆記"].tap()
            revealReaderChrome(for: noteControl)
            noteControl.tap()
            XCTAssertTrue(note.waitForExistence(timeout: 10.0))
        }
        note.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.15)).tap()
        app.typeText(syntheticNote)
        if app.buttons["Done"].waitForExistence(timeout: 3.0) { app.buttons["Done"].tap() }
        XCTAssertEqual(note.value as? String, syntheticNote)
        app.buttons["儲存筆記"].tap()
        openLibraryForExport()
        let scope = app.buttons["筆記"].firstMatch
        XCTAssertTrue(scope.waitForExistence(timeout: 10.0))
        scope.tap()
        let export = app.buttons["匯出筆記"]
        scrollToVisible(export, towardTop: true)
        export.tap()
        let expected = "章節筆記（1）\n筆記 1\n書名：潮汐之城\n章名：第一章：潮聲來信\n筆記內容：\n\(syntheticNote)\n—— 筆記結束 ——"
        XCTAssertEqual(assertExportPreview(filename: "reading-data.txt"), expected)
        attachScreenshot(name: "NativeNoteExportPreview")
        app.buttons["取消匯出"].tap()
        XCTAssertTrue(app.staticTexts["已取消匯出，原有資料保留。"].waitForExistence(timeout: 10.0))
        export.tap()
        XCTAssertEqual(assertExportPreview(filename: "reading-data.txt"), expected)
        app.buttons["儲存到此裝置"].tap()
        let failed = app.staticTexts["無法匯出檔案，原有資料保留。請重試。"]
        XCTAssertTrue(failed.waitForExistence(timeout: 10.0), "Actual filesystem failure must reach the product UI")
        attachScreenshot(name: "NativeNoteExportFailureRetainsData")
        export.tap()
        XCTAssertEqual(assertExportPreview(filename: "reading-data.txt"), expected)
        app.buttons["儲存到此裝置"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS '已儲存 reading-data.txt' ")).firstMatch.waitForExistence(timeout: 10.0))
        export.tap()
        XCTAssertEqual(assertExportPreview(filename: "reading-data-2.txt"), expected)
        app.buttons["取消匯出"].tap()
        app.terminate()
        app.launchArguments = []
        app.launch()
        openLibraryForExport()
        let exportAgain = app.buttons["匯出書籤與筆記"]
        scrollToVisible(exportAgain, towardTop: true)
        exportAgain.tap()
        XCTAssertEqual(assertExportPreview(filename: "reading-data-2.txt"), expected)
        attachScreenshot(name: "NativeNoteExportAfterRestart")
        app.buttons["取消匯出"].tap()
    }

    func testNativeDraftFileExport() throws {
        app.launch()
        ensureCatalogScreen()
        let search = app.searchFields.firstMatch
        search.tap()
        search.typeText("潮汐之城")
        if app.buttons["Done"].waitForExistence(timeout: 3.0) { app.buttons["Done"].tap() }
        let authoring = app.buttons["開啟創作預覽"]
        scrollToVisible(authoring, towardTop: false)
        authoring.tap()
        let input = app.textViews["Raw Agent JSON"]
        scrollToVisible(input, towardTop: false)
        input.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.15)).tap()
        let json = "{\"title\":\"Synthetic Export\",\"genre\":\"測試\",\"chapters\":[{\"sequence\":1,\"title\":\"合成章節\",\"prose\":\"合成段落一。\\n\\n合成段落二。\\n\\n合成段落三。\\n\\n合成段落四。\\n\\n合成段落五。\"}]}"
        app.typeText(json)
        if app.buttons["Done"].waitForExistence(timeout: 3.0) { app.buttons["Done"].tap() }
        XCTAssertEqual(input.value as? String, json)
        let importDraft = app.buttons["Import Structured Draft"]
        scrollToVisible(importDraft, towardTop: false)
        importDraft.tap()
        let export = app.buttons["匯出草稿 JSON"]
        XCTAssertTrue(export.waitForExistence(timeout: 10.0))
        scrollToVisible(export, towardTop: false)
        XCTAssertTrue(export.isEnabled)
        export.tap()
        let content = assertExportPreview(filename: "innovative-novels-draft-Synthetic Export.json")
        let parsed = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(content.utf8)) as? [String: Any])
        XCTAssertEqual(parsed["title"] as? String, "Synthetic Export")
        let chapters = try XCTUnwrap(parsed["chapters"] as? [[String: Any]])
        XCTAssertEqual(chapters.count, 1)
        XCTAssertEqual(chapters[0]["prose"] as? String, "合成段落一。\n\n合成段落二。\n\n合成段落三。\n\n合成段落四。\n\n合成段落五。")
        attachScreenshot(name: "NativeDraftJSONExportPreview")
        app.buttons["取消匯出"].tap()
        export.tap()
        XCTAssertEqual(assertExportPreview(filename: "innovative-novels-draft-Synthetic Export.json"), content)
        app.buttons["儲存到此裝置"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS '已儲存 innovative-novels-draft-Synthetic Export.json'")).firstMatch.waitForExistence(timeout: 10.0))
        let projectExport = app.buttons["Export Current Project"]
        scrollToVisible(projectExport, towardTop: true)
        projectExport.tap()
        let projectContent = assertExportPreview(filename: "innovative-novels-project-Untitled Project.json")
        let project = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(projectContent.utf8)) as? [String: Any])
        XCTAssertEqual(project["format"] as? String, "innovative-novels-authoring-project")
        attachScreenshot(name: "NativePortableProjectExportPreview")
        app.buttons["儲存到此裝置"].tap()
    }
}
