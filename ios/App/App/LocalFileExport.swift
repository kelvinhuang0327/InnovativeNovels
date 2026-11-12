import UIKit
import Capacitor

class NovelBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LocalFileExportPlugin())
        #if DEBUG
        NSLog("NovelExport bridge registered: %@", bridge == nil ? "no" : "yes")
        #endif
    }
}

// App-owned local export: no network, clipboard, or third-party share destination.
@objc(LocalFileExportPlugin)
class LocalFileExportPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LocalFileExportPlugin"
    let jsName = "LocalFileExport"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "exportFile", returnType: CAPPluginReturnPromise)]
    private var activeCall: CAPPluginCall?
    private var preview: UINavigationController?
    private var failedOnce = false

    @objc func exportFile(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in self?.prepare(call) }
    }

    private func prepare(_ call: CAPPluginCall) {
        #if DEBUG
        NSLog("NovelExport prepare")
        #endif
        guard activeCall == nil else {
            call.reject("An export is already open.", "EXPORT_BUSY")
            return
        }
        guard let filename = call.getString("filename"),
              !filename.isEmpty, filename.utf8.count <= 240,
              !filename.contains(where: { $0 == "/" || $0 == "\\" || $0.unicodeScalars.contains(where: { $0.value < 32 }) }),
              filename != ".", filename != "..",
              let content = call.getString("content"), !content.isEmpty,
              let data = content.data(using: .utf8), data.count <= 15 * 1024 * 1024,
              let mime = call.getString("mimeType"),
              (mime == "application/json" && filename.hasSuffix(".json")) || (mime == "text/plain" && filename.hasSuffix(".txt")) else {
            call.reject("The export file is invalid or exceeds 15 MB.", "INVALID_EXPORT")
            return
        }
        guard let presenter = bridge?.viewController, presenter.view.window != nil,
              presenter.presentedViewController == nil else {
            #if DEBUG
            NSLog("NovelExport presenter unavailable: controller=%@ window=%@ modal=%@", bridge?.viewController == nil ? "no" : "yes", bridge?.viewController?.view.window == nil ? "no" : "yes", bridge?.viewController?.presentedViewController == nil ? "no" : "yes")
            #endif
            call.reject("The export preview cannot be opened yet.", "EXPORT_UNAVAILABLE")
            return
        }

        guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            call.reject("Device storage is unavailable.", "EXPORT_UNAVAILABLE")
            return
        }
        let exportFolder = documents.appendingPathComponent("匯出", isDirectory: true)
        let chosenName = availableName(filename, in: exportFolder)
        // Preview/cancel/reopen must not create or remove files. Keep the snapshot in memory.
        activeCall = call
        let controller = LocalExportPreviewController(filename: chosenName, content: content)
        let navigation = UINavigationController(rootViewController: controller)
        navigation.isModalInPresentation = true
        controller.onCancel = { [weak self] in self?.finish(["status": "cancelled"]) }
        controller.onSave = { [weak self] in self?.save(data: data, folder: exportFolder, filename: chosenName) }
        preview = navigation
        presenter.present(navigation, animated: true)
    }

    private func availableName(_ original: String, in folder: URL) -> String {
        let path = original as NSString
        let stem = path.deletingPathExtension
        let suffix = path.pathExtension
        var name = original
        var index = 2
        while FileManager.default.fileExists(atPath: folder.appendingPathComponent(name).path) {
            name = "\(stem)-\(index).\(suffix)"
            index += 1
        }
        return name
    }

    private func save(data: Data, folder: URL, filename: String) {
        let staged = folder.appendingPathComponent(".novel-export-\(UUID().uuidString).tmp")
        // Remove only this save's staging file on success or failure; previous exports stay intact.
        defer { try? FileManager.default.removeItem(at: staged) }
        var stage = "directory"
        #if DEBUG
        var attemptedURL = folder
        #endif
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            #if DEBUG
            // UI acceptance exercises a real filesystem failure once, then retries normally.
            if ProcessInfo.processInfo.arguments.contains("-native-export-fail-once") && !failedOnce {
                failedOnce = true
                stage = "failure-fixture"
                let blocker = folder.appendingPathComponent(".novel-export-failure-\(UUID().uuidString)")
                defer { try? FileManager.default.removeItem(at: blocker) }
                attemptedURL = blocker
                try Data("synthetic failure".utf8).write(to: blocker, options: .atomic)
                attemptedURL = blocker.appendingPathComponent("not-a-directory")
                try data.write(to: blocker.appendingPathComponent("not-a-directory"))
            }
            #endif
            stage = "write"
            #if DEBUG
            attemptedURL = staged
            #endif
            try data.write(to: staged, options: .atomic)
            stage = "place"
            #if DEBUG
            attemptedURL = folder.appendingPathComponent(filename)
            #endif
            // moveItem refuses an existing destination, preserving earlier complete exports.
            try FileManager.default.moveItem(at: staged, to: folder.appendingPathComponent(filename))
            finish(["status": "saved", "filename": filename])
        } catch {
            #if DEBUG
            logSaveFailure(error as NSError, stage: stage, attemptedURL: attemptedURL)
            #endif
            finish(nil, error: "The file could not be saved on this device. Original data is retained.")
        }
    }

    #if DEBUG
    private func logSaveFailure(_ error: NSError, stage: String, attemptedURL: URL) {
        var failure = error
        var seen = Set<ObjectIdentifier>()
        for depth in 0..<8 {
            guard seen.insert(ObjectIdentifier(failure)).inserted else {
                NSLog("NovelExport error chain truncated: cycle")
                return
            }
            let failingURL = failure.userInfo[NSURLErrorFailingURLErrorKey] ?? failure.userInfo["NSURL"] ?? failure.userInfo[NSURLErrorFailingURLStringErrorKey]
            NSLog("NovelExport save failed: stage=%@ depth=%ld domain=%@ code=%ld attempted=%@ failingURL=%@ filePath=%@", stage, depth, failure.domain, failure.code, diagnosticPath(attemptedURL), diagnosticPath(failingURL), diagnosticPath(failure.userInfo[NSFilePathErrorKey]))
            guard let underlying = failure.userInfo[NSUnderlyingErrorKey] as? NSError else { return }
            failure = underlying
        }
        NSLog("NovelExport error chain truncated: depth-limit")
    }

    // Keep container-relative locations; never log absolute paths, user filenames, or error descriptions.
    private func diagnosticPath(_ value: Any?) -> String {
        let url: URL
        if let fileURL = value as? URL { url = fileURL }
        else if let path = value as? String, path.hasPrefix("/") { url = URL(fileURLWithPath: path) }
        else if let path = value as? String, let fileURL = URL(string: path), fileURL.isFileURL { url = fileURL }
        else { return value == nil ? "<not-provided>" : "<non-file-or-relative-path>" }
        guard url.isFileURL else { return "<non-file-url>" }
        let container = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true).standardizedFileURL.pathComponents
        let components = url.standardizedFileURL.pathComponents
        guard components.starts(with: container) else { return "<outside-app-container>" }
        let relative = Array(components.dropFirst(container.count))
        guard !relative.isEmpty else { return "app-container" }
        guard relative.starts(with: ["Documents", "匯出"]) else {
            let directory = ["Documents", "Library", "tmp"].contains(relative[0]) ? relative[0] : "<redacted-directory>"
            return "app-container/" + directory + (relative.count > 1 ? "/<redacted-relative-path>" : "")
        }
        let folder = "app-container/Documents/匯出"
        guard relative.count > 2 else { return folder }
        guard relative.count == 3 else { return folder + "/<redacted-subpath>" }
        let leaf = relative[2]
        let kind: String
        if leaf.contains(".sb-") { kind = "<atomic-auxiliary-file>" }
        else if leaf.hasPrefix(".novel-export-failure-") { kind = "<failure-fixture-file>" }
        else if leaf.hasPrefix(".novel-export-") { kind = "<staging-file>" }
        else { kind = "<export-file>" }
        return folder + "/" + kind
    }
    #endif

    private func finish(_ result: [String: Any]?, error: String? = nil) {
        guard let call = activeCall else { return }
        let navigation = preview
        let complete = { [weak self] in
            self?.activeCall = nil
            self?.preview = nil
            if let error = error { call.reject(error, "EXPORT_FAILED") }
            else { call.resolve(result ?? ["status": "cancelled"]) }
        }
        if navigation?.presentingViewController != nil { navigation?.dismiss(animated: true, completion: complete) }
        else { complete() }
    }
}

private class LocalExportPreviewController: UIViewController {
    var onCancel: (() -> Void)?
    var onSave: (() -> Void)?
    private let filename: String
    private let content: String

    init(filename: String, content: String) {
        self.filename = filename
        self.content = content
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("Use init(filename:content:)") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "本機匯出預覽"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "取消匯出", style: .plain, target: self, action: #selector(cancel))
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "儲存到此裝置", style: .plain, target: self, action: #selector(save))
        let name = UILabel()
        name.text = filename
        name.numberOfLines = 0
        name.font = .preferredFont(forTextStyle: .headline)
        name.accessibilityIdentifier = "native-export-filename"
        let explanation = UILabel()
        explanation.text = "確認後儲存在此 App 的「匯出」資料夾，可由「檔案」App 查看。取消會保留原有筆記和草稿。"
        explanation.numberOfLines = 0
        explanation.font = .preferredFont(forTextStyle: .footnote)
        let text = UITextView()
        text.text = content
        text.isEditable = false
        text.font = .preferredFont(forTextStyle: .body)
        text.accessibilityLabel = "匯出檔案內容"
        text.accessibilityIdentifier = "native-export-content"
        let stack = UIStackView(arrangedSubviews: [name, explanation, text])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16)
        ])
    }

    @objc private func cancel() {
        navigationItem.leftBarButtonItem?.isEnabled = false
        navigationItem.rightBarButtonItem?.isEnabled = false
        onCancel?()
    }

    @objc private func save() {
        navigationItem.leftBarButtonItem?.isEnabled = false
        navigationItem.rightBarButtonItem?.isEnabled = false
        onSave?()
    }
}
