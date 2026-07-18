import XCTest

final class MindBaseUITests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        // -UI_TESTING suppresses the auto-open pairing sheet on launch
        app.launchArguments = ["-UI_TESTING"]
        app.launch()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Test 1: Launch shows tab bar with 3 tabs

    func testLaunchShowsTabBar() throws {
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 5), "Tab bar should appear within 5 s of launch")

        XCTAssertTrue(tabBar.buttons["Voice"].exists, "Voice tab present")
        XCTAssertTrue(tabBar.buttons["Inbox"].exists, "Inbox tab present")
        XCTAssertTrue(tabBar.buttons["Settings"].exists, "Settings tab present")
    }

    // MARK: - Test 2: Settings tab shows Pair button (unpaired state)

    func testSettingsShowsPairButton() throws {
        app.tabBars.buttons["Settings"].tap()
        // accessibilityIdentifier set on the button in ContentView
        let pairButton = app.buttons["pair-device-button"]
        XCTAssertTrue(pairButton.waitForExistence(timeout: 3), "Pair button visible on Settings tab when unpaired")
    }

    // MARK: - Test 3: Pairing sheet fields are present

    func testPairingSheetFields() throws {
        app.tabBars.buttons["Settings"].tap()
        app.buttons["pair-device-button"].tap()

        // Server URL text field (accessibilityIdentifier set in PairingView)
        let serverField = app.textFields["server-url-field"]
        XCTAssertTrue(serverField.waitForExistence(timeout: 3), "Server URL field visible in pairing sheet")

        // Device name field
        let deviceField = app.textFields["device-name-field"]
        XCTAssertTrue(deviceField.exists, "Device name field visible in pairing sheet")

        // Pair code field
        let codeField = app.textFields["pair-code-field"]
        XCTAssertTrue(codeField.exists, "Pair code field visible in pairing sheet")

        // Pair submit button
        let submitButton = app.buttons["pair-submit-button"]
        XCTAssertTrue(submitButton.exists, "Pair submit button visible in pairing sheet")
    }

    // MARK: - Test 4: Pair button is disabled when code field is empty

    func testPairingWithEmptyCodeKeepsButtonDisabled() throws {
        app.tabBars.buttons["Settings"].tap()
        app.buttons["pair-device-button"].tap()

        let submitButton = app.buttons["pair-submit-button"]
        XCTAssertTrue(submitButton.waitForExistence(timeout: 3), "Pair submit button should appear")
        // SwiftUI .disabled() is reflected in isEnabled
        XCTAssertFalse(submitButton.isEnabled, "Pair button must be disabled when code field is empty")
    }

    // MARK: - Test 5: Voice tab shows mic button

    func testVoiceTabShowsMicButton() throws {
        app.tabBars.buttons["Voice"].tap()
        // accessibilityIdentifier set on the record button in VoiceRecorderView
        let micButton = app.buttons["mic-record-button"]
        XCTAssertTrue(micButton.waitForExistence(timeout: 3), "Mic record button visible on Voice tab")
    }

    // MARK: - Test 6: Inbox tab shows empty state

    func testInboxTabShowsEmptyState() throws {
        app.tabBars.buttons["Inbox"].tap()
        // InboxView renders "Inbox is empty." when entries.isEmpty && !loading
        // The network call fails in simulator (no server) so entries stays empty
        let emptyLabel = app.staticTexts["Inbox is empty."]
        XCTAssertTrue(emptyLabel.waitForExistence(timeout: 5), "Empty inbox label visible when no server reachable")
    }
}
