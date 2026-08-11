import XCTest

final class AppLaunchTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func ensureCatalogScreen(app: XCUIApplication) {
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
    }

    func testColdRelaunch() throws {
        let app = XCUIApplication()
        app.launch()

        ensureCatalogScreen(app: app)

        let heading = app.staticTexts["探索故事"]
        XCTAssertTrue(heading.waitForExistence(timeout: 15.0), "Catalog heading '探索故事' failed to appear")

        // Terminate and relaunch
        app.terminate()
        XCTAssertEqual(app.state, .notRunning, "App process did not terminate")

        app.launch()
        ensureCatalogScreen(app: app)

        XCTAssertTrue(heading.waitForExistence(timeout: 15.0), "Catalog heading failed to appear after cold relaunch")
        XCTAssertTrue(app.state == .runningForeground, "App process is not running in foreground")
    }
}
