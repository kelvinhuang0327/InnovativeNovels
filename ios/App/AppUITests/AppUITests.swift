import XCTest

final class AppUITests: XCTestCase {

    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
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

    private func ensureCatalogScreen() {
        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 15.0), "WebView failed to load")

        let catalogHeading = app.staticTexts["探索故事"]
        if catalogHeading.waitForExistence(timeout: 3.0) {
            return
        }

        let backToBook = app.buttons["返回作品"]
        if backToBook.waitForExistence(timeout: 5.0) {
            backToBook.tap()
        }

        let backToCatalog = app.buttons["返回書庫"]
        if backToCatalog.waitForExistence(timeout: 5.0) {
            backToCatalog.tap()
        }

        XCTAssertTrue(catalogHeading.waitForExistence(timeout: 10.0), "Failed to reach CatalogScreen")
    }

    // MARK: - Journey 1: Launch and Catalog
    func testJourney1_LaunchAndCatalog() throws {
        ensureCatalogScreen()

        let catalogHeading = app.staticTexts["探索故事"]
        XCTAssertTrue(catalogHeading.waitForExistence(timeout: 10.0), "Catalog heading '探索故事' not visible")

        let installPrompt = app.staticTexts["安裝 APP"]
        XCTAssertFalse(installPrompt.exists, "Browser-only '安裝 APP' prompt should be absent in native iOS app")

        let resultCount = app.staticTexts["共 6 本"]
        XCTAssertTrue(resultCount.waitForExistence(timeout: 5.0), "Catalog result count '共 6 本' not visible")

        let book1 = app.staticTexts["潮汐之城"]
        let book6 = app.staticTexts["時間縫隙中的花"]
        XCTAssertTrue(book1.exists, "Book '潮汐之城' should be visible")
        XCTAssertTrue(book6.exists, "Book '時間縫隙中的花' should be visible")

        attachScreenshot(name: "Journey1_CatalogScreen")
    }

    // MARK: - Journey 2: Genre Filter
    func testJourney2_GenreFilter() throws {
        ensureCatalogScreen()

        let sciFiButton = app.buttons["科幻"]
        XCTAssertTrue(sciFiButton.waitForExistence(timeout: 10.0), "Genre filter button '科幻' not visible")
        sciFiButton.tap()

        let filteredCount = app.staticTexts["找到 1 本"]
        XCTAssertTrue(filteredCount.waitForExistence(timeout: 5.0), "Filtered result count '找到 1 本' not visible")

        let targetBook = app.staticTexts["軌道盡頭的微光"]
        XCTAssertTrue(targetBook.exists, "Book '軌道盡頭的微光' should be visible under 科幻 filter")

        let unrelatedBook = app.staticTexts["潮汐之城"]
        XCTAssertFalse(unrelatedBook.exists, "Unrelated book '潮汐之城' should not be visible under 科幻 filter")

        let allButton = app.buttons["全部"]
        XCTAssertTrue(allButton.exists, "Genre filter button '全部' not visible")
        allButton.tap()

        let fullCount = app.staticTexts["共 6 本"]
        XCTAssertTrue(fullCount.waitForExistence(timeout: 5.0), "Full catalog count '共 6 本' not restored after clearing filter")

        attachScreenshot(name: "Journey2_GenreFilter")
    }

    // MARK: - Journey 3: Search Title and Author
    func testJourney3_SearchTitleAndAuthor() throws {
        ensureCatalogScreen()

        let searchInput = app.searchFields.firstMatch.exists ? app.searchFields.firstMatch : app.textFields.firstMatch
        XCTAssertTrue(searchInput.waitForExistence(timeout: 10.0), "Search input field not visible")
        searchInput.tap()
        searchInput.typeText("潮汐")

        let titleResultCount = app.staticTexts["找到 1 本"]
        XCTAssertTrue(titleResultCount.waitForExistence(timeout: 5.0), "Title search result count '找到 1 本' not visible")
        XCTAssertTrue(app.staticTexts["潮汐之城"].exists, "Book '潮汐之城' not found in title search")

        let clearButton = app.buttons["清除篩選"]
        XCTAssertTrue(clearButton.exists, "Clear filters button '清除篩選' not visible")
        clearButton.tap()

        let restoredCount = app.staticTexts["共 6 本"]
        XCTAssertTrue(restoredCount.waitForExistence(timeout: 5.0), "Full catalog not restored after clearing search")

        searchInput.tap()
        searchInput.typeText("岑海")

        let authorResultCount = app.staticTexts["找到 1 本"]
        XCTAssertTrue(authorResultCount.waitForExistence(timeout: 5.0), "Author search result count '找到 1 本' not visible")
        XCTAssertTrue(app.staticTexts["軌道盡頭的微光"].exists, "Book '軌道盡頭的微光' by 岑海 not found in author search")

        clearButton.tap()
        XCTAssertTrue(app.staticTexts["共 6 本"].waitForExistence(timeout: 5.0), "Catalog count not restored after author search clear")

        attachScreenshot(name: "Journey3_SearchScreen")
    }

    // MARK: - Journey 4: Book Detail
    func testJourney4_BookDetail() throws {
        ensureCatalogScreen()

        let viewBookButtons = app.buttons.matching(NSPredicate(format: "label == '查看書籍'")).allElementsBoundByIndex
        XCTAssertFalse(viewBookButtons.isEmpty, "No '查看書籍' button found on Catalog")
        viewBookButtons[0].tap()

        let bookTitleHeading = app.staticTexts["潮汐之城"]
        XCTAssertTrue(bookTitleHeading.waitForExistence(timeout: 10.0), "Book detail title '潮汐之城' not visible")

        let authorMeta = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "陸遠")).firstMatch
        XCTAssertTrue(authorMeta.exists, "Author '陸遠' not visible on detail screen")

        let chapterListHeading = app.staticTexts["章節預覽"]
        XCTAssertTrue(chapterListHeading.exists, "Chapter preview section '章節預覽' not visible")

        let startReadingButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "閱讀")).firstMatch
        XCTAssertTrue(startReadingButton.exists, "Start reading button not visible")

        let lockedChapterNotice = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "已鎖定")).firstMatch
        XCTAssertTrue(lockedChapterNotice.exists, "Locked chapter indicator '已鎖定' should exist in chapter list")

        attachScreenshot(name: "Journey4_BookDetailScreen")
    }

    // MARK: - Journey 5: Reader and Prose
    func testJourney5_ReaderAndProse() throws {
        ensureCatalogScreen()

        let viewBookButtons = app.buttons.matching(NSPredicate(format: "label == '查看書籍'")).allElementsBoundByIndex
        XCTAssertFalse(viewBookButtons.isEmpty, "No '查看書籍' button found on Catalog")
        viewBookButtons[0].tap()

        let startReadingButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "閱讀")).firstMatch
        XCTAssertTrue(startReadingButton.waitForExistence(timeout: 10.0), "Start reading button not visible")
        startReadingButton.tap()

        let chapterTitle = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "第一章")).firstMatch
        XCTAssertTrue(chapterTitle.waitForExistence(timeout: 10.0), "Reader chapter title not visible")

        let proseExcerpt = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "燈火")).firstMatch
        XCTAssertTrue(proseExcerpt.exists, "Prose excerpt not visible in Reader")

        let nextChapterButton = app.buttons["下一章"].firstMatch
        XCTAssertTrue(nextChapterButton.exists, "Next chapter button '下一章' not visible")
        nextChapterButton.tap()

        let chapter2Title = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "第二章")).firstMatch
        XCTAssertTrue(chapter2Title.waitForExistence(timeout: 10.0), "Chapter 2 title not visible after tapping '下一章'")

        let prevChapterButton = app.buttons["上一章"].firstMatch
        XCTAssertTrue(prevChapterButton.exists, "Previous chapter button '上一章' not visible")
        prevChapterButton.tap()

        XCTAssertTrue(chapterTitle.waitForExistence(timeout: 10.0), "Chapter 1 title not restored after tapping '上一章'")

        let backToBookButton = app.buttons["返回作品"]
        XCTAssertTrue(backToBookButton.exists, "Button '返回作品' not visible")
        backToBookButton.tap()

        let bookTitleHeading = app.staticTexts["潮汐之城"]
        XCTAssertTrue(bookTitleHeading.waitForExistence(timeout: 10.0), "Book detail '潮汐之城' not restored")

        let backToCatalogButton = app.buttons["返回書庫"]
        XCTAssertTrue(backToCatalogButton.exists, "Button '返回書庫' not visible")
        backToCatalogButton.tap()

        XCTAssertTrue(app.staticTexts["探索故事"].waitForExistence(timeout: 10.0), "Catalog '探索故事' not restored")
        XCTAssertEqual(app.state, .runningForeground, "App process should remain alive throughout reader navigation")

        attachScreenshot(name: "Journey5_ReaderScreen")
    }

    // MARK: - Journey 6: Back Navigation
    func testJourney6_BackNavigation() throws {
        ensureCatalogScreen()

        let viewBookButtons = app.buttons.matching(NSPredicate(format: "label == '查看書籍'")).allElementsBoundByIndex
        XCTAssertFalse(viewBookButtons.isEmpty, "No '查看書籍' button found on Catalog")
        viewBookButtons[0].tap()

        XCTAssertTrue(app.staticTexts["潮汐之城"].waitForExistence(timeout: 10.0), "Book Detail screen failed to open")

        let startReadingButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "閱讀")).firstMatch
        XCTAssertTrue(startReadingButton.waitForExistence(timeout: 10.0), "Start reading button not found")
        startReadingButton.tap()

        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "第一章")).firstMatch.waitForExistence(timeout: 10.0), "Reader screen failed to open")

        let backToBookButton = app.buttons["返回作品"]
        XCTAssertTrue(backToBookButton.waitForExistence(timeout: 10.0), "Button '返回作品' not found")
        backToBookButton.tap()

        XCTAssertTrue(app.staticTexts["潮汐之城"].waitForExistence(timeout: 10.0), "Failed to return to Book Detail")

        let backToCatalogButton = app.buttons["返回書庫"]
        XCTAssertTrue(backToCatalogButton.waitForExistence(timeout: 10.0), "Button '返回書庫' not found")
        backToCatalogButton.tap()

        XCTAssertTrue(app.staticTexts["探索故事"].waitForExistence(timeout: 10.0), "Failed to return to Catalog")
        XCTAssertEqual(app.state, .runningForeground, "App process unexpectedly terminated during back navigation")

        attachScreenshot(name: "Journey6_BackNavigation")
    }

    // MARK: - Journey 7: Cold Relaunch
    func testJourney7_ColdRelaunch() throws {
        ensureCatalogScreen()

        let catalogHeading = app.staticTexts["探索故事"]
        XCTAssertTrue(catalogHeading.waitForExistence(timeout: 10.0), "Catalog heading '探索故事' not visible before relaunch")

        app.terminate()
        XCTAssertEqual(app.state, .notRunning, "App process did not terminate")

        app.launch()
        ensureCatalogScreen()

        XCTAssertTrue(catalogHeading.waitForExistence(timeout: 15.0), "Catalog heading '探索故事' not visible after cold relaunch")
        XCTAssertFalse(app.staticTexts["安裝 APP"].exists, "Install prompt should remain absent after relaunch")
        XCTAssertEqual(app.state, .runningForeground, "App is not running in foreground after cold relaunch")

        attachScreenshot(name: "Journey7_ColdRelaunch")
    }

    // MARK: - Journey 8: Basic Layout and Safe-Area Smoke
    func testJourney8_BasicLayoutAndSafeArea() throws {
        ensureCatalogScreen()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.exists, "Main application window not found")

        let catalogHeading = app.staticTexts["探索故事"]
        XCTAssertTrue(catalogHeading.waitForExistence(timeout: 10.0), "Catalog heading not found")

        let headingFrame = catalogHeading.frame
        let windowFrame = window.frame

        XCTAssertGreaterThanOrEqual(headingFrame.minY, windowFrame.minY, "Top control/heading starts outside top of window frame")
        XCTAssertLessThanOrEqual(headingFrame.maxY, windowFrame.maxY, "Heading exceeds bottom of window frame")
        XCTAssertGreaterThan(headingFrame.width, 0, "Heading has 0 width")
        XCTAssertGreaterThan(headingFrame.height, 0, "Heading has 0 height")

        let searchInput = app.searchFields.firstMatch.exists ? app.searchFields.firstMatch : app.textFields.firstMatch
        if searchInput.exists {
            let searchFrame = searchInput.frame
            XCTAssertGreaterThanOrEqual(searchFrame.minX, windowFrame.minX, "Search field clipped left")
            XCTAssertLessThanOrEqual(searchFrame.maxX, windowFrame.maxX, "Search field clipped right")
            XCTAssertGreaterThan(searchFrame.width, 0, "Search field width is zero")
            XCTAssertGreaterThan(searchFrame.height, 0, "Search field height is zero")
        }

        let allButtons = app.buttons.allElementsBoundByIndex
        XCTAssertFalse(allButtons.isEmpty, "No interactive buttons found on Catalog screen")
        for btn in allButtons.prefix(3) {
            XCTAssertGreaterThan(btn.frame.width, 0, "Button \(btn.label) has 0 width")
            XCTAssertGreaterThan(btn.frame.height, 0, "Button \(btn.label) has 0 height")
        }

        attachScreenshot(name: "Journey8_SafeAreaLayout")
    }
}
