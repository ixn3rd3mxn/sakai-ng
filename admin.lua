-- Owner-only highlight panel (Rebels + puzzle objects + interactable props)
-- Targets anything in workspace matching the keywords
-- (default: "Rebel" and "RBL-R", e.g. "Augmented Rebel Heavy", "RBL-R Mine")
-- LocalScript (e.g. StarterPlayer > StarterPlayerScripts)

local Players = game:GetService("Players")
local player = Players.LocalPlayer

---------------------------------------------------------------------
-- Owner check (works for both user-owned and group-owned games)
---------------------------------------------------------------------
local function isOwner()
	if game.CreatorType == Enum.CreatorType.User then
		return player.UserId == game.CreatorId
	elseif game.CreatorType == Enum.CreatorType.Group then
		local ok, rank = pcall(player.GetRankInGroup, player, game.CreatorId)
		return ok and rank == 255 -- 255 = group owner
	end
	return false
end

local REQUIRE_OWNER = true -- set back to true to re-enable the owner check

if REQUIRE_OWNER and not isOwner() then
	return
end

---------------------------------------------------------------------
-- Settings
---------------------------------------------------------------------
local settings = {
	Enabled = false,
	Keywords = { "Rebel", "RBL-R" }, -- any name containing one of these as a whole word
	FillColor = Color3.fromRGB(255, 0, 0),
	OutlineColor = Color3.fromRGB(255, 255, 255),
	FillTransparency = 0.5,
	AlwaysOnTop = true,
}

local highlights = {} -- [Instance] = Highlight
local countLabel -- set once the UI is created

---------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------
local function matches(inst, keywords)
	-- escape special characters, then match each keyword as a whole word
	-- "Rebel Breacher", "Augmented Rebel Heavy", "RBL-R Mine" = match
	-- "Rebellion", "Rebels" = no match
	-- keywords is optional, defaults to the list from the Highlight tab
	for _, keyword in ipairs(keywords or settings.Keywords) do
		local escaped = keyword:gsub("%p", "%%%0")
		if inst.Name:find("%f[%w]" .. escaped .. "%f[%W]") then
			return true
		end
	end
	return false
end

local function keywordsText()
	return table.concat(settings.Keywords, ", ")
end

local function countHighlights()
	local n = 0
	for _ in pairs(highlights) do n += 1 end
	return n
end

local function updateCountLabel()
	if not countLabel then return end
	local n = countHighlights()
	local text = "Highlighted: " .. n
	if n > 31 then
		text ..= "  (over Roblox's limit of 31, some won't show)"
	end
	countLabel:Set(text)
end

---------------------------------------------------------------------
-- Highlight logic
---------------------------------------------------------------------
local function styleHighlight(h)
	h.FillColor = settings.FillColor
	h.OutlineColor = settings.OutlineColor
	h.FillTransparency = settings.FillTransparency
	h.DepthMode = settings.AlwaysOnTop
		and Enum.HighlightDepthMode.AlwaysOnTop
		or Enum.HighlightDepthMode.Occluded
end

local function addHighlight(target)
	if highlights[target] then return end
	local h = Instance.new("Highlight")
	h.Name = "OwnerHighlight"
	h.Adornee = target
	styleHighlight(h)
	h.Parent = target
	highlights[target] = h
	updateCountLabel()
end

local function removeHighlight(target)
	local h = highlights[target]
	if h then
		h:Destroy()
		highlights[target] = nil
		updateCountLabel()
	end
end

local function clearAll()
	for target in pairs(highlights) do
		removeHighlight(target)
	end
end

local function refreshAll()
	clearAll()
	if not settings.Enabled then return 0 end
	for _, child in ipairs(workspace:GetChildren()) do
		if matches(child) then
			addHighlight(child)
		end
	end
	return countHighlights()
end

local function restyleAll()
	for _, h in pairs(highlights) do
		styleHighlight(h)
	end
end

-- Auto-highlight new targets as they spawn
workspace.ChildAdded:Connect(function(child)
	if settings.Enabled and matches(child) then
		task.wait() -- let the model finish loading
		if child.Parent == workspace then
			addHighlight(child)
		end
	end
end)

-- Clean up when a target is removed
workspace.ChildRemoved:Connect(function(child)
	removeHighlight(child)
end)

---------------------------------------------------------------------
-- Puzzle highlights (everything inside these folders in workspace.Terrain)
---------------------------------------------------------------------
local terrain = workspace.Terrain

local puzzleGroups = {
	{ Name = "EoWMonitors",   Color = Color3.fromRGB(0, 170, 255) },
	{ Name = "Puzzle Input",  Color = Color3.fromRGB(0, 255, 120) },
	{ Name = "Puzzle Output", Color = Color3.fromRGB(255, 200, 0) },
	{ Name = "SecondPuzzle",  Color = Color3.fromRGB(200, 80, 255) },
}
for _, group in ipairs(puzzleGroups) do
	group.Enabled = false
	group.Highlights = {}  -- [Instance] = Highlight
	group.Connections = {}
end

local puzzleStyle = {
	OutlineColor = Color3.fromRGB(255, 255, 255),
	FillTransparency = 0.5,
	AlwaysOnTop = true,
}

local puzzleCountLabel -- set once the UI is created

local function countPuzzleHighlights()
	local n = 0
	for _, group in ipairs(puzzleGroups) do
		for _ in pairs(group.Highlights) do n += 1 end
	end
	return n
end

local function updatePuzzleCountLabel()
	if not puzzleCountLabel then return end
	local n = countPuzzleHighlights()
	local text = "Highlighted: " .. n
	if n + countHighlights() > 31 then
		text ..= "  (over Roblox's limit of 31 across both tabs, some won't show)"
	end
	puzzleCountLabel:Set(text)
end

local function stylePuzzle(group, h)
	h.FillColor = group.Color
	h.OutlineColor = puzzleStyle.OutlineColor
	h.FillTransparency = puzzleStyle.FillTransparency
	h.DepthMode = puzzleStyle.AlwaysOnTop
		and Enum.HighlightDepthMode.AlwaysOnTop
		or Enum.HighlightDepthMode.Occluded
end

local function addPuzzleHighlight(group, target)
	-- Highlights only work on Models and Parts
	if group.Highlights[target] then return end
	if not (target:IsA("Model") or target:IsA("BasePart")) then return end

	local h = Instance.new("Highlight")
	h.Name = "PuzzleHighlight"
	h.Adornee = target
	stylePuzzle(group, h)
	h.Parent = target
	group.Highlights[target] = h
	updatePuzzleCountLabel()
end

local function removePuzzleHighlight(group, target)
	local h = group.Highlights[target]
	if h then
		h:Destroy()
		group.Highlights[target] = nil
		updatePuzzleCountLabel()
	end
end

local function clearGroup(group)
	for _, h in pairs(group.Highlights) do
		h:Destroy()
	end
	table.clear(group.Highlights)
	for _, c in ipairs(group.Connections) do
		c:Disconnect()
	end
	table.clear(group.Connections)
	updatePuzzleCountLabel()
end

local function watchFolder(group, folder)
	for _, child in ipairs(folder:GetChildren()) do
		addPuzzleHighlight(group, child)
	end
	table.insert(group.Connections, folder.ChildAdded:Connect(function(child)
		task.wait() -- let it finish loading
		if child.Parent == folder then
			addPuzzleHighlight(group, child)
		end
	end))
	table.insert(group.Connections, folder.ChildRemoved:Connect(function(child)
		removePuzzleHighlight(group, child)
	end))
end

-- Returns how many objects got highlighted, or nil if the folder doesn't exist yet
local function enableGroup(group)
	clearGroup(group)
	if not group.Enabled then return 0 end

	local folder = terrain:FindFirstChild(group.Name)
	if folder then
		watchFolder(group, folder)
	end

	-- If the folder shows up later (or gets replaced), pick it up
	table.insert(group.Connections, terrain.ChildAdded:Connect(function(child)
		if child.Name == group.Name then
			task.wait()
			watchFolder(group, child)
		end
	end))

	if not folder then return nil end
	local n = 0
	for _ in pairs(group.Highlights) do n += 1 end
	return n
end

local function restylePuzzles()
	for _, group in ipairs(puzzleGroups) do
		for _, h in pairs(group.Highlights) do
			stylePuzzle(group, h)
		end
	end
end

---------------------------------------------------------------------
-- Props (children of workspace.Terrain.InteractablePropsFolder)
-- Ported from your Prop Highlighter script
---------------------------------------------------------------------
local RunService = game:GetService("RunService")

local PROP_FOLDER_NAME = "InteractablePropsFolder"
local HIGHLIGHT_LIMIT = 31 -- Roblox renders ~31 Highlights at once, shared by all tabs

local propSettings = {
	ShowHighlight = true,
	ShowNametag = true,
	ShowDistance = true,
	ShowLine = true,
	Color = Color3.fromRGB(255, 200, 0),
	LineFrom = "Character", -- "Character" (your character) or "Bottom" (bottom of screen)
	LineThickness = 2,
	DistanceUpdateRate = 0.1, -- seconds between distance updates
}

local propFolder -- set once the folder is found
local propHighlights = {} -- [prop] = Highlight
local propTags = {}       -- [prop] = BillboardGui (name + distance)
local propLines = {}      -- [prop] = Frame (screen line)
local propSelected = {}   -- [name] = true, what's picked in the dropdown
local propStatusLabel     -- set once the UI is created
local propDropdown        -- set once the UI is created

local propHolder = Instance.new("Folder")
propHolder.Name = "OwnerPropHighlights"
propHolder.Parent = workspace.CurrentCamera -- client-only, never replicates

local propLineGui = Instance.new("ScreenGui")
propLineGui.Name = "PropLines"
propLineGui.ResetOnSpawn = false
propLineGui.IgnoreGuiInset = true
propLineGui.DisplayOrder = -1
propLineGui.Parent = player:WaitForChild("PlayerGui")

local function canHighlightProp(obj)
	return obj:IsA("Model") or obj:IsA("BasePart")
end

local function getAnchorPart(p)
	if p:IsA("BasePart") then
		return p
	end
	return p.PrimaryPart or p:FindFirstChildWhichIsA("BasePart", true)
end

local function getPropPosition(p)
	if p:IsA("BasePart") then
		return p.Position
	end
	return p:GetPivot().Position
end

local function getPropDistance(p)
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	local origin = root and root.Position or workspace.CurrentCamera.CFrame.Position
	return (getPropPosition(p) - origin).Magnitude
end

local function propTagText(p)
	local out = {}
	if propSettings.ShowNametag then
		table.insert(out, p.Name)
	end
	if propSettings.ShowDistance then
		table.insert(out, string.format("%d studs", math.floor(getPropDistance(p))))
	end
	return table.concat(out, "\n")
end

local function countPropHighlights()
	local n = 0
	for _ in pairs(propHighlights) do n += 1 end
	return n
end

local function countProps()
	if not propFolder then return 0 end
	local n = 0
	for _, child in ipairs(propFolder:GetChildren()) do
		if canHighlightProp(child) then n += 1 end
	end
	return n
end

local function totalHighlights()
	return countHighlights() + countPuzzleHighlights() + countPropHighlights()
end

local function updatePropStatus(extra)
	if not propStatusLabel then return end
	local text
	if propFolder then
		text = string.format("%d / %d highlighted", countPropHighlights(), countProps())
	else
		text = "Waiting for workspace.Terrain." .. PROP_FOLDER_NAME .. "..."
	end
	if extra then
		text ..= "  •  " .. extra
	end
	propStatusLabel:Set(text)
end

local function makePropTag(p)
	local anchor = getAnchorPart(p)
	if not anchor then return end
	local height = p:IsA("Model") and p:GetExtentsSize().Y or p.Size.Y

	local bb = Instance.new("BillboardGui")
	bb.Name = "PropTag"
	bb.Enabled = propSettings.ShowNametag or propSettings.ShowDistance
	bb.Adornee = anchor
	bb.Size = UDim2.fromOffset(160, 36)
	bb.StudsOffsetWorldSpace = Vector3.new(0, height / 2 + 1.5, 0)
	bb.AlwaysOnTop = true
	bb.LightInfluence = 0
	bb.MaxDistance = math.huge

	local label = Instance.new("TextLabel")
	label.Name = "Label"
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBold
	label.TextSize = 14
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0.3
	label.Text = propTagText(p)
	label.Parent = bb

	bb.Parent = propHolder
	propTags[p] = bb
end

local function makePropLine(p)
	local f = Instance.new("Frame")
	f.Name = "Line"
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.BackgroundColor3 = propSettings.Color
	f.BorderSizePixel = 0
	f.Visible = false
	f.Parent = propLineGui
	propLines[p] = f
end

-- Returns false if the highlight limit stopped it
local function setPropHighlighted(p, on)
	if on and not propHighlights[p] then
		if totalHighlights() >= HIGHLIGHT_LIMIT then
			updatePropStatus("limit reached (" .. HIGHLIGHT_LIMIT .. " across all tabs)")
			return false
		end
		local h = Instance.new("Highlight")
		h.Adornee = p
		h.FillColor = propSettings.Color
		h.OutlineColor = Color3.new(1, 1, 1)
		h.FillTransparency = 0.5
		h.OutlineTransparency = 0
		h.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
		h.Enabled = propSettings.ShowHighlight
		h.Parent = propHolder
		propHighlights[p] = h
		makePropTag(p)
		makePropLine(p)
	elseif not on and propHighlights[p] then
		propHighlights[p]:Destroy()
		propHighlights[p] = nil
		if propTags[p] then
			propTags[p]:Destroy()
			propTags[p] = nil
		end
		if propLines[p] then
			propLines[p]:Destroy()
			propLines[p] = nil
		end
	end
	updatePropStatus()
	return true
end

-- Make the highlighted props match the names picked in the dropdown
local function applyPropSelection(selected)
	if type(selected) ~= "table" then
		selected = { selected } -- older Rayfield passes a single string
	end
	local wanted = {}
	for _, name in ipairs(selected) do
		wanted[name] = true
	end
	propSelected = wanted

	-- Turn off first so we free up highlight slots
	for p in pairs(propHighlights) do
		if not wanted[p.Name] then
			setPropHighlighted(p, false)
		end
	end
	if not propFolder then return end
	for _, p in ipairs(propFolder:GetChildren()) do
		if canHighlightProp(p) and wanted[p.Name] and not propHighlights[p] then
			if not setPropHighlighted(p, true) then
				break
			end
		end
	end
end

local function getPropNames()
	local seen, names = {}, {}
	if propFolder then
		for _, c in ipairs(propFolder:GetChildren()) do
			if canHighlightProp(c) and not seen[c.Name] then
				seen[c.Name] = true
				table.insert(names, c.Name)
			end
		end
	end
	table.sort(names)
	return names
end

local lastPropNamesKey
local function refreshPropOptions()
	if not propDropdown then return end
	local names = getPropNames()
	local key = table.concat(names, "\0")
	if key == lastPropNamesKey then return end
	lastPropNamesKey = key

	propDropdown:Refresh(names)
	-- keep whatever was picked before, if it still exists
	local keep = {}
	for _, name in ipairs(names) do
		if propSelected[name] then
			table.insert(keep, name)
		end
	end
	if #keep > 0 then
		propDropdown:Set(keep)
	end
end

local function applyPropToggles()
	for _, h in pairs(propHighlights) do
		h.Enabled = propSettings.ShowHighlight
	end
	for p, bb in pairs(propTags) do
		bb.Enabled = propSettings.ShowNametag or propSettings.ShowDistance
		bb.Label.Text = propTagText(p)
	end
end

local function hookPropFolder(folder)
	propFolder = folder
	folder.ChildAdded:Connect(function(child)
		task.wait() -- let it finish loading
		if child.Parent == folder and canHighlightProp(child) then
			if propSelected[child.Name] then
				setPropHighlighted(child, true)
			end
			refreshPropOptions()
			updatePropStatus()
		end
	end)
	folder.ChildRemoved:Connect(function(child)
		setPropHighlighted(child, false)
		refreshPropOptions()
		updatePropStatus()
	end)
	refreshPropOptions()
	updatePropStatus()
end

do
	local existing = terrain:FindFirstChild(PROP_FOLDER_NAME)
	if existing then
		hookPropFolder(existing)
	else
		local conn
		conn = terrain.ChildAdded:Connect(function(child)
			if child.Name == PROP_FOLDER_NAME then
				conn:Disconnect()
				hookPropFolder(child)
			end
		end)
	end
end

-- Distance text updates
local propElapsed = 0
RunService.Heartbeat:Connect(function(dt)
	propElapsed += dt
	if propElapsed < propSettings.DistanceUpdateRate then return end
	propElapsed = 0
	if not propSettings.ShowDistance then return end
	for p, bb in pairs(propTags) do
		bb.Label.Text = propTagText(p)
	end
end)

-- Lines (redrawn every frame so they stay smooth)
RunService.RenderStepped:Connect(function()
	if not propSettings.ShowLine then
		for _, f in pairs(propLines) do
			f.Visible = false
		end
		return
	end

	local cam = workspace.CurrentCamera
	local vp = cam.ViewportSize
	local from = Vector2.new(vp.X / 2, vp.Y)

	if propSettings.LineFrom == "Character" then
		local char = player.Character
		local root = char and char:FindFirstChild("HumanoidRootPart")
		if root then
			local rp = cam:WorldToViewportPoint(root.Position)
			if rp.Z > 0 then
				from = Vector2.new(rp.X, rp.Y)
			end
		end
	end

	for p, f in pairs(propLines) do
		local sp = cam:WorldToViewportPoint(getPropPosition(p))
		if sp.Z <= 0 then
			f.Visible = false -- behind the camera
		else
			local to = Vector2.new(sp.X, sp.Y)
			local delta = to - from
			f.Size = UDim2.fromOffset(delta.Magnitude, propSettings.LineThickness)
			f.Position = UDim2.fromOffset((from.X + to.X) / 2, (from.Y + to.Y) / 2)
			f.Rotation = math.deg(math.atan2(delta.Y, delta.X))
			f.Visible = true
		end
	end
end)

---------------------------------------------------------------------
-- Rayfield UI
---------------------------------------------------------------------
local Rayfield = loadstring(game:HttpGet("https://sirius.menu/rayfield"))()

local Window = Rayfield:CreateWindow({
	Name = "Owner Panel",
	LoadingTitle = "Owner Panel",
	LoadingSubtitle = "Rebel Tools",
	ConfigurationSaving = { Enabled = false },
	KeySystem = false,
})

local Tab = Window:CreateTab("Highlight", 4483362458)

Tab:CreateSection("Rebels")

countLabel = Tab:CreateLabel("Highlighted: 0")

Tab:CreateToggle({
	Name = "Highlight All Rebels",
	CurrentValue = false,
	Flag = "HighlightToggle",
	Callback = function(value)
		settings.Enabled = value
		if value then
			local count = refreshAll()
			Rayfield:Notify({
				Title = "Highlight",
				Content = count > 0
					and ("Highlighting " .. count .. " object(s) matching: " .. keywordsText())
					or ("Nothing in workspace matches " .. keywordsText() .. " right now. New ones will be highlighted when they spawn."),
				Duration = 4,
			})
		else
			clearAll()
		end
	end,
})

Tab:CreateInput({
	Name = "Keywords (comma separated)",
	CurrentValue = keywordsText(),
	PlaceholderText = "Rebel, RBL-R",
	RemoveTextAfterFocusLost = false,
	Flag = "Keywords",
	Callback = function(text)
		local list = {}
		for word in text:gmatch("[^,]+") do
			word = word:match("^%s*(.-)%s*$") -- trim spaces
			if word ~= "" then
				table.insert(list, word)
			end
		end
		settings.Keywords = list
		refreshAll()
	end,
})

Tab:CreateSection("Style")

Tab:CreateColorPicker({
	Name = "Fill Color",
	Color = settings.FillColor,
	Flag = "FillColor",
	Callback = function(color)
		settings.FillColor = color
		restyleAll()
	end,
})

Tab:CreateColorPicker({
	Name = "Outline Color",
	Color = settings.OutlineColor,
	Flag = "OutlineColor",
	Callback = function(color)
		settings.OutlineColor = color
		restyleAll()
	end,
})

Tab:CreateSlider({
	Name = "Fill Transparency",
	Range = { 0, 1 },
	Increment = 0.05,
	CurrentValue = settings.FillTransparency,
	Flag = "FillTransparency",
	Callback = function(value)
		settings.FillTransparency = value
		restyleAll()
	end,
})

Tab:CreateToggle({
	Name = "Show Through Walls",
	CurrentValue = settings.AlwaysOnTop,
	Flag = "AlwaysOnTop",
	Callback = function(value)
		settings.AlwaysOnTop = value
		restyleAll()
	end,
})

Tab:CreateButton({
	Name = "Refresh Highlights",
	Callback = function()
		refreshAll()
	end,
})

---------------- Puzzles tab ----------------
local PuzzleTab = Window:CreateTab("Puzzles", 4483362458)

PuzzleTab:CreateSection("workspace.Terrain folders")

puzzleCountLabel = PuzzleTab:CreateLabel("Highlighted: 0")

for _, group in ipairs(puzzleGroups) do
	PuzzleTab:CreateToggle({
		Name = group.Name,
		CurrentValue = false,
		Flag = "Puzzle_" .. group.Name,
		Callback = function(value)
			group.Enabled = value
			local count = enableGroup(group)
			if value then
				Rayfield:Notify({
					Title = group.Name,
					Content = count
						and ("Highlighting " .. count .. " object(s) in workspace.Terrain." .. group.Name)
						or ("workspace.Terrain." .. group.Name .. " doesn't exist yet. It'll be highlighted when it appears."),
					Duration = 4,
				})
			end
		end,
	})

	PuzzleTab:CreateColorPicker({
		Name = group.Name .. " Color",
		Color = group.Color,
		Flag = "PuzzleColor_" .. group.Name,
		Callback = function(color)
			group.Color = color
			restylePuzzles()
		end,
	})
end

PuzzleTab:CreateSection("Style")

PuzzleTab:CreateColorPicker({
	Name = "Outline Color",
	Color = puzzleStyle.OutlineColor,
	Flag = "PuzzleOutline",
	Callback = function(color)
		puzzleStyle.OutlineColor = color
		restylePuzzles()
	end,
})

PuzzleTab:CreateSlider({
	Name = "Fill Transparency",
	Range = { 0, 1 },
	Increment = 0.05,
	CurrentValue = puzzleStyle.FillTransparency,
	Flag = "PuzzleTransparency",
	Callback = function(value)
		puzzleStyle.FillTransparency = value
		restylePuzzles()
	end,
})

PuzzleTab:CreateToggle({
	Name = "Show Through Walls",
	CurrentValue = puzzleStyle.AlwaysOnTop,
	Flag = "PuzzleAlwaysOnTop",
	Callback = function(value)
		puzzleStyle.AlwaysOnTop = value
		restylePuzzles()
	end,
})

PuzzleTab:CreateButton({
	Name = "Refresh Puzzle Highlights",
	Callback = function()
		for _, group in ipairs(puzzleGroups) do
			enableGroup(group)
		end
	end,
})

---------------- Props tab ----------------
local PropTab = Window:CreateTab("Props", 4483362458)

PropTab:CreateSection("workspace.Terrain.InteractablePropsFolder")

propStatusLabel = PropTab:CreateLabel("0 / 0 highlighted")

propDropdown = PropTab:CreateDropdown({
	Name = "Pick Props",
	Options = {},
	CurrentOption = {},
	MultipleOptions = true,
	Flag = "PropSelection",
	Callback = function(selected)
		applyPropSelection(selected)
	end,
})

PropTab:CreateButton({
	Name = "Highlight All",
	Callback = function()
		local all = getPropNames()
		propDropdown:Set(all)
		applyPropSelection(all)
	end,
})

PropTab:CreateButton({
	Name = "Clear All",
	Callback = function()
		propDropdown:Set({})
		applyPropSelection({})
	end,
})

PropTab:CreateSection("Show")

PropTab:CreateToggle({
	Name = "Highlight",
	CurrentValue = propSettings.ShowHighlight,
	Flag = "PropShowHighlight",
	Callback = function(value)
		propSettings.ShowHighlight = value
		applyPropToggles()
	end,
})

PropTab:CreateToggle({
	Name = "Nametag",
	CurrentValue = propSettings.ShowNametag,
	Flag = "PropShowNametag",
	Callback = function(value)
		propSettings.ShowNametag = value
		applyPropToggles()
	end,
})

PropTab:CreateToggle({
	Name = "Distance",
	CurrentValue = propSettings.ShowDistance,
	Flag = "PropShowDistance",
	Callback = function(value)
		propSettings.ShowDistance = value
		applyPropToggles()
	end,
})

PropTab:CreateToggle({
	Name = "Line",
	CurrentValue = propSettings.ShowLine,
	Flag = "PropShowLine",
	Callback = function(value)
		propSettings.ShowLine = value
	end,
})

PropTab:CreateSection("Style")

PropTab:CreateColorPicker({
	Name = "Color",
	Color = propSettings.Color,
	Flag = "PropColor",
	Callback = function(color)
		propSettings.Color = color
		for _, h in pairs(propHighlights) do
			h.FillColor = color
		end
		for _, f in pairs(propLines) do
			f.BackgroundColor3 = color
		end
	end,
})

PropTab:CreateDropdown({
	Name = "Line Starts From",
	Options = { "Character", "Bottom" },
	CurrentOption = { propSettings.LineFrom },
	MultipleOptions = false,
	Flag = "PropLineFrom",
	Callback = function(option)
		propSettings.LineFrom = type(option) == "table" and option[1] or option
	end,
})

PropTab:CreateSlider({
	Name = "Line Thickness",
	Range = { 1, 5 },
	Increment = 1,
	CurrentValue = propSettings.LineThickness,
	Flag = "PropLineThickness",
	Callback = function(value)
		propSettings.LineThickness = value
	end,
})

-- Fill in the dropdown now that the UI exists
refreshPropOptions()
updatePropStatus()

---------------- Platform tab ----------------
local platformSettings = {
	Size = 8,        -- width/length in studs
	Thickness = 1,
	Color = Color3.fromRGB(0, 170, 255),
}

local platforms = {} -- newest last, so "Remove Last" works
local platformFolder = Instance.new("Folder")
platformFolder.Name = "OwnerPlatforms"
platformFolder.Parent = workspace

local function createPlatform()
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not (root and hum) then
		return false
	end

	-- find where the feet are (R6 legs are 2 studs, R15 uses HipHeight)
	local legLength = hum.RigType == Enum.HumanoidRigType.R6 and 2 or hum.HipHeight
	local feetY = root.Position.Y - root.Size.Y / 2 - legLength

	local p = Instance.new("Part")
	p.Name = "Platform"
	p.Anchored = true
	p.CanCollide = true
	p.Size = Vector3.new(platformSettings.Size, platformSettings.Thickness, platformSettings.Size)
	p.Position = Vector3.new(root.Position.X, feetY - platformSettings.Thickness / 2, root.Position.Z)
	p.Color = platformSettings.Color
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = platformFolder
	table.insert(platforms, p)

	-- stop falling so you land cleanly on it
	root.AssemblyLinearVelocity = Vector3.zero
	return true
end

local PlatformTab = Window:CreateTab("Platform", 4483362458)

PlatformTab:CreateSection("Create")

PlatformTab:CreateButton({
	Name = "Create Platform Under Me",
	Callback = function()
		if not createPlatform() then
			Rayfield:Notify({
				Title = "Platform",
				Content = "No character found. Try again after you spawn.",
				Duration = 3,
			})
		end
	end,
})

-- Big flat platform at a fixed spot (2048 = the longest a part can be in Roblox)
local LONG_PLATFORM_POSITION = Vector3.new(-40.15, 150.66, 986.91)
local LONG_PLATFORM_SIZE = Vector3.new(2048, 1, 2048)
local longPlatform -- the one we made, so a second click doesn't stack a copy on top

PlatformTab:CreateButton({
	Name = "Create Longest Platform (-40.15, 150.66, 986.91)",
	Callback = function()
		if longPlatform and longPlatform.Parent then
			Rayfield:Notify({
				Title = "Platform",
				Content = "The long platform is already there. Use Remove Last / Remove All to delete it.",
				Duration = 3,
			})
			return
		end

		local p = Instance.new("Part")
		p.Name = "LongPlatform"
		p.Anchored = true
		p.CanCollide = true
		p.Size = LONG_PLATFORM_SIZE
		p.Position = LONG_PLATFORM_POSITION -- centered on the spot
		p.Color = platformSettings.Color
		p.Material = Enum.Material.SmoothPlastic
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		p.Parent = platformFolder
		table.insert(platforms, p)
		longPlatform = p

		Rayfield:Notify({
			Title = "Platform",
			Content = string.format("Long platform created at %.2f, %.2f, %.2f (%d x %d studs).",
				LONG_PLATFORM_POSITION.X, LONG_PLATFORM_POSITION.Y, LONG_PLATFORM_POSITION.Z,
				LONG_PLATFORM_SIZE.X, LONG_PLATFORM_SIZE.Z),
			Duration = 4,
		})
	end,
})

PlatformTab:CreateButton({
	Name = "Remove Last Platform",
	Callback = function()
		local p = table.remove(platforms)
		if p then
			p:Destroy()
		end
	end,
})

PlatformTab:CreateButton({
	Name = "Remove All Platforms",
	Callback = function()
		platformFolder:ClearAllChildren()
		table.clear(platforms)
	end,
})

PlatformTab:CreateSection("Position")

PlatformTab:CreateButton({
	Name = "Print My XYZ",
	Callback = function()
		local char = player.Character
		local root = char and char:FindFirstChild("HumanoidRootPart")
		if not root then
			Rayfield:Notify({
				Title = "Position",
				Content = "No character found. Try again after you spawn.",
				Duration = 3,
			})
			return
		end
		local p = root.Position
		local text = string.format("X = %.2f, Y = %.2f, Z = %.2f", p.X, p.Y, p.Z)
		print("[Owner Panel] My position: " .. text)
		Rayfield:Notify({
			Title = "Position",
			Content = text,
			Duration = 6,
		})
	end,
})

PlatformTab:CreateSection("Style")

PlatformTab:CreateSlider({
	Name = "Platform Size",
	Range = { 4, 30 },
	Increment = 1,
	CurrentValue = platformSettings.Size,
	Flag = "PlatformSize",
	Callback = function(value)
		platformSettings.Size = value
	end,
})

PlatformTab:CreateColorPicker({
	Name = "Platform Color",
	Color = platformSettings.Color,
	Flag = "PlatformColor",
	Callback = function(color)
		platformSettings.Color = color
	end,
})

---------------- Collision tab ----------------
local collisionState = {
	CanCollide = { Disabled = false, Saved = {}, Gen = 0 }, -- Saved[part] = original value
	CanQuery   = { Disabled = false, Saved = {}, Gen = 0 },
}
local collisionLabel -- set once the UI is created

local function countSaved(prop)
	local n = 0
	for _ in pairs(collisionState[prop].Saved) do n += 1 end
	return n
end

local function updateCollisionLabel()
	if not collisionLabel then return end
	collisionLabel:Set(string.format(
		"Changed parts  •  CanCollide: %d  •  CanQuery: %d",
		countSaved("CanCollide"), countSaved("CanQuery")
	))
end

-- Only parts inside these folders in workspace.Terrain are changed
local AREA_NAMES = { "Bridge", "Facility" }

local function getAreaRoots()
	local roots = {}
	for _, name in ipairs(AREA_NAMES) do
		local folder = workspace.Terrain:FindFirstChild(name)
		if folder then
			table.insert(roots, folder)
		end
	end
	return roots
end

local function isInArea(inst)
	for _, root in ipairs(getAreaRoots()) do
		if inst:IsDescendantOf(root) then
			return true
		end
	end
	return false
end

-- Everything inside the areas (scanned when a toggle is turned on)
local function getAreaDescendants()
	local list = {}
	for _, root in ipairs(getAreaRoots()) do
		for _, d in ipairs(root:GetDescendants()) do
			table.insert(list, d)
		end
	end
	return list
end

local function areaText()
	return "workspace.Terrain." .. table.concat(AREA_NAMES, " / ")
end

-- Parts we never touch
local function isExcluded(part)
	if not isInArea(part) then return true end -- outside Bridge / Facility
	if part == workspace.Terrain then return true end
	if part:IsDescendantOf(platformFolder) then return true end -- your platforms keep working
	if part:IsDescendantOf(workspace.CurrentCamera) then return true end
	for _, plr in ipairs(Players:GetPlayers()) do
		local c = plr.Character
		if c and part:IsDescendantOf(c) then return true end
	end
	return false
end

local function disablePartProp(prop, part)
	local state = collisionState[prop]
	if state.Saved[part] ~= nil or isExcluded(part) then return end
	state.Saved[part] = part[prop] -- remember the original value
	part[prop] = false
end

-- Returns how many parts got changed
local function setCollisionProp(prop, disabled)
	local state = collisionState[prop]
	state.Disabled = disabled
	state.Gen += 1
	local gen = state.Gen

	if disabled then
		for i, d in ipairs(getAreaDescendants()) do
			if d:IsA("BasePart") then
				disablePartProp(prop, d)
			end
			if i % 5000 == 0 then
				task.wait() -- spread big maps over a few frames
				if state.Gen ~= gen then return countSaved(prop) end -- toggled again, stop
			end
		end
	else
		for part, original in pairs(state.Saved) do
			if part.Parent then
				part[prop] = original -- back to default
			end
		end
		table.clear(state.Saved)
	end
	updateCollisionLabel()
	return countSaved(prop)
end

-- New parts that spawn while disabled get disabled too
workspace.DescendantAdded:Connect(function(d)
	if not d:IsA("BasePart") then return end
	for prop, state in pairs(collisionState) do
		if state.Disabled then
			disablePartProp(prop, d)
		end
	end
end)

-- Forget parts that get removed, so the list doesn't grow forever
workspace.DescendantRemoving:Connect(function(d)
	for _, state in pairs(collisionState) do
		state.Saved[d] = nil
	end
end)

local CollisionTab = Window:CreateTab("Collision", 4483362458)

CollisionTab:CreateSection("Bridge + Facility only")

collisionLabel = CollisionTab:CreateLabel("Changed parts  •  CanCollide: 0  •  CanQuery: 0")

local collideToggle = CollisionTab:CreateToggle({
	Name = "Disable CanCollide",
	CurrentValue = false,
	Flag = "DisableCanCollide",
	Callback = function(value)
		local n = setCollisionProp("CanCollide", value)
		if value then
			Rayfield:Notify({
				Title = "CanCollide",
				Content = n > 0
					and ("Disabled on " .. n .. " part(s) in " .. areaText() .. ". Your platforms still work.")
					or ("No parts found in " .. areaText() .. " yet. New ones will be changed when they load."),
				Duration = 4,
			})
		end
	end,
})

local queryToggle = CollisionTab:CreateToggle({
	Name = "Disable CanQuery",
	CurrentValue = false,
	Flag = "DisableCanQuery",
	Callback = function(value)
		local n = setCollisionProp("CanQuery", value)
		if value then
			Rayfield:Notify({
				Title = "CanQuery",
				Content = n > 0
					and ("Disabled on " .. n .. " part(s) in " .. areaText() .. ".")
					or ("No parts found in " .. areaText() .. " yet. New ones will be changed when they load."),
				Duration = 4,
			})
		end
	end,
})

CollisionTab:CreateButton({
	Name = "Restore All to Default",
	Callback = function()
		collideToggle:Set(false)
		queryToggle:Set(false)
		setCollisionProp("CanCollide", false) -- in case Set() didn't fire the callback
		setCollisionProp("CanQuery", false)
	end,
})

---------------- Transparency (in Collision tab) ----------------
local xray = {
	Enabled = false,
	Amount = 0.7, -- 0 = normal, 1 = invisible
	Changed = {}, -- [part or decal] = true
	Gen = 0,
}

-- Parts get it directly; decals/textures only if their part isn't excluded
local function canXray(inst)
	if inst:IsA("BasePart") then
		return not isExcluded(inst)
	end
	if inst:IsA("Decal") then -- Texture counts as a Decal too
		local parent = inst.Parent
		return parent and parent:IsA("BasePart") and not isExcluded(parent)
	end
	return false
end

local function applyXray(inst)
	if canXray(inst) then
		inst.LocalTransparencyModifier = xray.Amount
		xray.Changed[inst] = true
	end
end

local function setXray(enabled)
	xray.Enabled = enabled
	xray.Gen += 1
	local gen = xray.Gen

	if enabled then
		for i, d in ipairs(getAreaDescendants()) do
			applyXray(d)
			if i % 5000 == 0 then
				task.wait()
				if xray.Gen ~= gen then return end -- toggled again, stop
			end
		end
	else
		for inst in pairs(xray.Changed) do
			if inst.Parent then
				inst.LocalTransparencyModifier = 0 -- back to normal
			end
		end
		table.clear(xray.Changed)
	end
end

workspace.DescendantAdded:Connect(function(d)
	if xray.Enabled then
		applyXray(d)
	end
end)

workspace.DescendantRemoving:Connect(function(d)
	xray.Changed[d] = nil
end)

CollisionTab:CreateSection("Transparency")

CollisionTab:CreateToggle({
	Name = "Make All Parts Transparent",
	CurrentValue = false,
	Flag = "XrayEnabled",
	Callback = function(value)
		setXray(value)
	end,
})

CollisionTab:CreateSlider({
	Name = "Transparency Amount",
	Range = { 0, 1 },
	Increment = 0.05,
	CurrentValue = xray.Amount,
	Flag = "XrayAmount",
	Callback = function(value)
		xray.Amount = value
		if xray.Enabled then
			for inst in pairs(xray.Changed) do
				inst.LocalTransparencyModifier = value
			end
		end
	end,
})


---------------- Water (in Collision tab) ----------------
-- Only workspace.Terrain.Water: transparency + disable/enable
-- Disabling takes the water parts out of the Water folder and takes the folder
-- out of the game on your screen. Enabling puts everything back.
-- "Delete Water" really destroys it (like deleting it by hand), until you rejoin.
local WATER_NAME = "Water"

local water = {
	Transparency = 0, -- 0 = normal, 1 = invisible (added on top of its own look)
	Disabled = false,
	Removed = {}, -- { root = Water, children = {...} } we took out, kept to put back
}

local function getWaterRoot()
	return workspace.Terrain:FindFirstChild(WATER_NAME)
end

local function isWaterThing(inst)
	return inst:IsA("BasePart") or inst:IsA("Decal") -- Texture counts as a Decal too
end

-- Apply the transparency slider to the water that's in the game
local function applyWaterTransparency()
	local root = getWaterRoot()
	if not root then return end
	if isWaterThing(root) then
		root.LocalTransparencyModifier = water.Transparency
	end
	for _, d in ipairs(root:GetDescendants()) do
		if isWaterThing(d) then
			d.LocalTransparencyModifier = water.Transparency
		end
	end
end

-- Returns how many Water objects were taken out / put back
local function setWaterDisabled(disabled)
	water.Disabled = disabled
	local n = 0
	if disabled then
		local root = getWaterRoot()
		while root do
			local children = root:GetChildren()
			for _, child in ipairs(children) do
				child.Parent = nil -- empty the folder, so the game finds no water parts in it
			end
			table.insert(water.Removed, { root = root, children = children })
			root.Parent = nil -- take the folder out too, but keep it to put back later
			n += 1
			root = getWaterRoot()
		end
	else
		for _, entry in ipairs(water.Removed) do
			entry.root.Parent = workspace.Terrain -- back where it was
			for _, child in ipairs(entry.children) do
				child.Parent = entry.root
			end
			n += 1
		end
		table.clear(water.Removed)
		applyWaterTransparency()
	end
	return n
end

-- Really destroys the water (same as deleting it by hand). Can't be undone until you rejoin.
local function deleteWater()
	local n = 0
	for _, entry in ipairs(water.Removed) do
		for _, child in ipairs(entry.children) do
			child:Destroy()
		end
		entry.root:Destroy()
		n += 1
	end
	table.clear(water.Removed)
	local root = getWaterRoot()
	while root do
		root:Destroy()
		n += 1
		root = getWaterRoot()
	end
	return n
end

-- If the game adds Water again while it's disabled (new round, reload), take it out too
workspace.Terrain.ChildAdded:Connect(function(child)
	if child.Name ~= WATER_NAME or not water.Disabled then return end
	task.defer(function() -- can't change Parent inside ChildAdded directly
		if water.Disabled and child.Parent == workspace.Terrain then
			local children = child:GetChildren()
			for _, c in ipairs(children) do
				c.Parent = nil
			end
			table.insert(water.Removed, { root = child, children = children })
			child.Parent = nil
		end
	end)
end)

-- Water parts that load in later get the transparency too
workspace.Terrain.DescendantAdded:Connect(function(d)
	if water.Transparency <= 0 or not isWaterThing(d) then return end
	local root = getWaterRoot()
	if root and (d == root or d:IsDescendantOf(root)) then
		d.LocalTransparencyModifier = water.Transparency
	end
end)

CollisionTab:CreateSection("Water (workspace.Terrain.Water)")

CollisionTab:CreateToggle({
	Name = "Disable Water",
	CurrentValue = false,
	Flag = "WaterDisabled",
	Callback = function(value)
		local n = setWaterDisabled(value)
		if value then
			Rayfield:Notify({
				Title = "Water",
				Content = n > 0
					and "Water removed. No more swimming there. Turn off to bring it back."
					or ("workspace.Terrain." .. WATER_NAME .. " doesn't exist right now. It'll be removed if it shows up."),
				Duration = 4,
			})
		end
	end,
})

CollisionTab:CreateButton({
	Name = "Delete Water (until rejoin)",
	Callback = function()
		local n = deleteWater()
		Rayfield:Notify({
			Title = "Water",
			Content = n > 0
				and "Water deleted. It comes back when you rejoin."
				or ("workspace.Terrain." .. WATER_NAME .. " doesn't exist right now."),
			Duration = 4,
		})
	end,
})

CollisionTab:CreateSlider({
	Name = "Water Transparency",
	Range = { 0, 1 },
	Increment = 0.05,
	CurrentValue = water.Transparency,
	Flag = "WaterTransparency",
	Callback = function(value)
		water.Transparency = value
		applyWaterTransparency()
	end,
})

---------------- XYZ Size tab ----------------
-- Resizes only the "Golden Cake" entries in workspace.Service.Debris
-- Per cake: Debris[<Golden Cake>].Parts.Model:GetChildren()[6]
-- Matched by NAME, not by position, because the position (e.g. 44) changes as things spawn
local CAKE_NAME = "Golden Cake"
local CAKE_PART_INDEX = 6

local cakeSize = {
	Enabled = false,
	Size = Vector3.new(555, 555, 555),
	Transparency = 0, -- 0 = normal, 1 = invisible (local only, works with or without resizing)
	Saved = setmetatable({}, { __mode = "k" }), -- [part] = original Size (weak, so removed cakes are collected)
}
local cakeLabel -- set once the UI is created

local function countCakes()
	local n = 0
	for part in pairs(cakeSize.Saved) do
		if part.Parent then n += 1 end
	end
	return n
end

local function updateCakeLabel()
	if not cakeLabel then return end
	cakeLabel:Set(string.format("Resized: %d  •  Size: %g x %g x %g",
		countCakes(), cakeSize.Size.X, cakeSize.Size.Y, cakeSize.Size.Z))
end

local function getCakePart(cake)
	local parts = cake:FindFirstChild("Parts")
	local model = parts and parts:FindFirstChild("Model")
	local part = model and model:GetChildren()[CAKE_PART_INDEX]
	if part and part:IsA("BasePart") then
		return part
	end
	return nil
end

-- For a cake that just spawned: wait until its parts have loaded
local function waitCakePart(cake)
	local parts = cake:WaitForChild("Parts", 5)
	local model = parts and parts:WaitForChild("Model", 5)
	if not model then return nil end
	local waited = 0
	while #model:GetChildren() < CAKE_PART_INDEX and waited < 5 do
		waited += task.wait()
	end
	return getCakePart(cake)
end

local function resizeCakePart(part)
	if cakeSize.Saved[part] == nil then
		cakeSize.Saved[part] = part.Size -- remember the original
	end
	part.Size = cakeSize.Size
end

-- Returns how many cakes got resized (or restored)
local function setCakesResized(enabled)
	cakeSize.Enabled = enabled
	local n = 0
	if enabled then
		local debris = workspace:FindFirstChild("Service") and workspace.Service:FindFirstChild("Debris")
		if debris then
			for _, cake in ipairs(debris:GetChildren()) do
				if cake.Name == CAKE_NAME then
					local part = getCakePart(cake)
					if part then
						resizeCakePart(part)
						n += 1
					end
				end
			end
		end
	else
		for part, original in pairs(cakeSize.Saved) do
			if part.Parent then
				part.Size = original
				n += 1
			end
		end
		table.clear(cakeSize.Saved)
	end
	updateCakeLabel()
	return n
end

-- Sets the transparency on every Golden Cake right now (0 puts it back to normal)
local function applyCakeTransparency()
	local service = workspace:FindFirstChild("Service")
	local debris = service and service:FindFirstChild("Debris")
	if not debris then return end
	for _, cake in ipairs(debris:GetChildren()) do
		if cake.Name == CAKE_NAME then
			local part = getCakePart(cake)
			if part then
				part.LocalTransparencyModifier = cakeSize.Transparency
			end
		end
	end
end

-- Cakes that spawn later get resized too (Debris may not exist yet, so wait for it)
task.spawn(function()
	local service = workspace:WaitForChild("Service", 30)
	local debris = service and service:WaitForChild("Debris", 30)
	if not debris then return end
	debris.ChildAdded:Connect(function(cake)
		if cake.Name ~= CAKE_NAME then return end
		local part = waitCakePart(cake)
		if not part then return end
		if cakeSize.Enabled then
			resizeCakePart(part)
			updateCakeLabel()
		end
		if cakeSize.Transparency > 0 then
			part.LocalTransparencyModifier = cakeSize.Transparency
		end
	end)
end)

local function parseAxis(text, fallback)
	local v = tonumber(text)
	if not v then return fallback end
	return math.clamp(v, 0.05, 2048) -- Roblox part size limits
end

local function setCakeAxis(axis, text)
	local s = cakeSize.Size
	local x, y, z = s.X, s.Y, s.Z
	if axis == "X" then x = parseAxis(text, x)
	elseif axis == "Y" then y = parseAxis(text, y)
	else z = parseAxis(text, z) end
	cakeSize.Size = Vector3.new(x, y, z)

	if cakeSize.Enabled then
		for part in pairs(cakeSize.Saved) do
			if part.Parent then
				part.Size = cakeSize.Size
			end
		end
	end
	updateCakeLabel()
end

local SizeTab = Window:CreateTab("XYZ Size", 4483362458)

SizeTab:CreateSection("Golden Cake only (workspace.Service.Debris)")

cakeLabel = SizeTab:CreateLabel("Resized: 0")
updateCakeLabel()

SizeTab:CreateToggle({
	Name = "Resize Golden Cake",
	CurrentValue = false,
	Flag = "CakeResize",
	Callback = function(value)
		local n = setCakesResized(value)
		Rayfield:Notify({
			Title = CAKE_NAME,
			Content = value
				and (n > 0
					and ("Resized " .. n .. " " .. CAKE_NAME .. "(s). New ones are resized when they spawn.")
					or ("No " .. CAKE_NAME .. " in workspace.Service.Debris right now. New ones will be resized when they spawn."))
				or ("Restored " .. n .. " " .. CAKE_NAME .. "(s) to their original size."),
			Duration = 4,
		})
	end,
})

for _, axis in ipairs({ "X", "Y", "Z" }) do
	SizeTab:CreateInput({
		Name = "Size " .. axis,
		CurrentValue = "555",
		PlaceholderText = "555",
		RemoveTextAfterFocusLost = false,
		Flag = "CakeSize" .. axis,
		Callback = function(text)
			setCakeAxis(axis, text)
		end,
	})
end

SizeTab:CreateSlider({
	Name = "Golden Cake Transparency",
	Range = { 0, 1 },
	Increment = 0.05,
	CurrentValue = cakeSize.Transparency,
	Flag = "CakeTransparency",
	Callback = function(value)
		cakeSize.Transparency = value
		applyCakeTransparency()
	end,
})

---------------- Supply Pads tab ----------------
-- workspace.Terrain.SupplyHouses:GetChildren()[n].Ammo.SupplyPad
-- workspace.Terrain.SupplyHouses:GetChildren()[n].HealPad.SupplyPad
-- Applies to EVERY house (matched by name, not by position like [5])
local PAD_HOUSES_NAME = "SupplyHouses"
local PAD_PART_NAME = "SupplyPad"
local PAD_GROUPS = { Ammo = true, HealPad = true }
local PAD_MAX_SIZE = 2048 -- Roblox caps every axis of a part's Size at 2048

local padSettings = {
	Size = Vector3.new(9999, 9999, 9999), -- what you asked for (capped when applied)
	Transparency = 0, -- 0 = normal, 1 = invisible (local only)
}
-- Saved[part] = original value (weak, so removed pads are collected)
local padProps = {
	Size       = { Active = false, Saved = setmetatable({}, { __mode = "k" }) },
	CanCollide = { Active = false, Saved = setmetatable({}, { __mode = "k" }) },
	CanQuery   = { Active = false, Saved = setmetatable({}, { __mode = "k" }) },
}
local padHouses -- set once workspace.Terrain.SupplyHouses is found
local padLabel, padSizeLabel -- set once the UI is created

local function padEffectiveSize()
	local s = padSettings.Size
	return Vector3.new(
		math.min(s.X, PAD_MAX_SIZE),
		math.min(s.Y, PAD_MAX_SIZE),
		math.min(s.Z, PAD_MAX_SIZE)
	)
end

local function isPad(inst)
	if inst.Name ~= PAD_PART_NAME or not inst:IsA("BasePart") then return false end
	local group = inst.Parent
	return group ~= nil
		and PAD_GROUPS[group.Name] == true
		and group.Parent ~= nil
		and group.Parent.Parent == padHouses
end

local function getPads()
	local list = {}
	if not padHouses then return list end
	for _, house in ipairs(padHouses:GetChildren()) do
		for groupName in pairs(PAD_GROUPS) do
			local group = house:FindFirstChild(groupName)
			local pad = group and group:FindFirstChild(PAD_PART_NAME)
			if pad and pad:IsA("BasePart") then
				table.insert(list, pad)
			end
		end
	end
	return list
end

local function countPadSaved(prop)
	local n = 0
	for part in pairs(padProps[prop].Saved) do
		if part.Parent then n += 1 end
	end
	return n
end

local function updatePadLabels()
	if padLabel then
		padLabel:Set(string.format(
			"Pads found: %d  •  Size: %d  •  CanCollide: %d  •  CanQuery: %d",
			#getPads(), countPadSaved("Size"), countPadSaved("CanCollide"), countPadSaved("CanQuery")
		))
	end
	if padSizeLabel then
		local want, eff = padSettings.Size, padEffectiveSize()
		local text = string.format("Applied size: %g x %g x %g", eff.X, eff.Y, eff.Z)
		if want ~= eff then
			text ..= string.format("  (capped from %g x %g x %g)", want.X, want.Y, want.Z)
		end
		padSizeLabel:Set(text)
	end
end

local function setPadProp(prop, part)
	local saved = padProps[prop].Saved
	if saved[part] == nil then
		saved[part] = part[prop] -- remember the original
	end
	part[prop] = prop == "Size" and padEffectiveSize() or false
end

-- Applies everything that's currently switched on to one pad
local function applyPad(part)
	for prop, state in pairs(padProps) do
		if state.Active then
			setPadProp(prop, part)
		end
	end
	if padSettings.Transparency > 0 then
		part.LocalTransparencyModifier = padSettings.Transparency
	end
end

-- Returns how many pads got changed (or restored)
local function setPadActive(prop, on)
	local state = padProps[prop]
	state.Active = on
	local n = 0
	if on then
		for _, pad in ipairs(getPads()) do
			setPadProp(prop, pad)
			n += 1
		end
	else
		for part, original in pairs(state.Saved) do
			if part.Parent then
				part[prop] = original -- back to default
				n += 1
			end
		end
		table.clear(state.Saved)
	end
	updatePadLabels()
	return n
end

local function applyPadTransparency()
	for _, pad in ipairs(getPads()) do
		pad.LocalTransparencyModifier = padSettings.Transparency
	end
end

-- Pads that spawn later get the same treatment
local function hookPadHouses(folder)
	padHouses = folder
	folder.DescendantAdded:Connect(function(d)
		if d.Name ~= PAD_PART_NAME then return end
		task.defer(function() -- let it finish loading
			if d.Parent and isPad(d) then
				applyPad(d)
				updatePadLabels()
			end
		end)
	end)
	for _, pad in ipairs(getPads()) do
		applyPad(pad) -- folder showed up while a toggle was already on
	end
	updatePadLabels()
end

do
	local existing = workspace.Terrain:FindFirstChild(PAD_HOUSES_NAME)
	if existing then
		hookPadHouses(existing)
	end
	-- also picks it up if it shows up later or gets replaced
	workspace.Terrain.ChildAdded:Connect(function(child)
		if child.Name == PAD_HOUSES_NAME then
			hookPadHouses(child)
		end
	end)
end

local function padNotify(title, n, on, doneText, restoredText)
	Rayfield:Notify({
		Title = title,
		Content = on
			and (n > 0
				and (doneText .. " on " .. n .. " pad(s). New ones are changed when they spawn.")
				or ("No pads in workspace.Terrain." .. PAD_HOUSES_NAME .. " right now. New ones will be changed when they spawn."))
			or (restoredText .. " on " .. n .. " pad(s)."),
		Duration = 4,
	})
end

local PadTab = Window:CreateTab("Supply Pads", 4483362458)

PadTab:CreateSection("Ammo.SupplyPad + HealPad.SupplyPad (all houses)")

padLabel = PadTab:CreateLabel("Pads found: 0")
padSizeLabel = PadTab:CreateLabel("Applied size:")
updatePadLabels()

PadTab:CreateToggle({
	Name = "Resize Supply Pads",
	CurrentValue = false,
	Flag = "PadResize",
	Callback = function(value)
		local n = setPadActive("Size", value)
		padNotify("Supply Pads", n, value, "Resized", "Restored size")
	end,
})

for _, axis in ipairs({ "X", "Y", "Z" }) do
	PadTab:CreateInput({
		Name = "Size " .. axis,
		CurrentValue = "9999",
		PlaceholderText = "9999",
		RemoveTextAfterFocusLost = false,
		Flag = "PadSize" .. axis,
		Callback = function(text)
			local v = tonumber(text)
			if not v then return end
			local s = padSettings.Size
			local comps = { X = s.X, Y = s.Y, Z = s.Z }
			comps[axis] = math.max(v, 0.05)
			padSettings.Size = Vector3.new(comps.X, comps.Y, comps.Z)

			if padProps.Size.Active then
				local size = padEffectiveSize()
				for part in pairs(padProps.Size.Saved) do
					if part.Parent then
						part.Size = size
					end
				end
			end
			updatePadLabels()
		end,
	})
end

PadTab:CreateSection("Collision")

PadTab:CreateToggle({
	Name = "Disable CanCollide",
	CurrentValue = false,
	Flag = "PadCanCollide",
	Callback = function(value)
		local n = setPadActive("CanCollide", value)
		padNotify("Supply Pads", n, value, "CanCollide disabled", "CanCollide restored")
	end,
})

PadTab:CreateToggle({
	Name = "Disable CanQuery",
	CurrentValue = false,
	Flag = "PadCanQuery",
	Callback = function(value)
		local n = setPadActive("CanQuery", value)
		padNotify("Supply Pads", n, value, "CanQuery disabled", "CanQuery restored")
	end,
})

PadTab:CreateSection("Look")

PadTab:CreateSlider({
	Name = "Supply Pad Transparency",
	Range = { 0, 1 },
	Increment = 0.05,
	CurrentValue = padSettings.Transparency,
	Flag = "PadTransparency",
	Callback = function(value)
		padSettings.Transparency = value
		applyPadTransparency()
	end,
})

---------------- Rebel Torso tab ----------------
-- workspace:GetChildren()[n].Torso for every Rebel, e.g.
-- "Rebel XXX", "XXX Rebel", "XXX Rebel XXX", "RBL-R Mine"
-- Matched by NAME (same whole-word rule as the Highlight tab), not by position like [28].
-- Uses its own keyword list, so editing the Highlight tab's keywords doesn't change this tab.
local REBEL_KEYWORDS = { "Rebel", "RBL-R" }
local PEBBLES_KEYWORDS = { "Commander Pebbles" }
local REBEL_TORSO_NAME = "Torso"

-- One entry per toggle. Every group shares the Size inputs and the transparency slider.
local rebelGroups = {
	{
		Name = "Rebel", Flag = "RebelTorsoResize", Keywords = REBEL_KEYWORDS,
		Enabled = false, Saved = setmetatable({}, { __mode = "k" }), -- [torso] = original Size
	},
	{
		Name = "Commander Pebbles", Flag = "PebblesTorsoResize", Keywords = PEBBLES_KEYWORDS,
		Enabled = false, Saved = setmetatable({}, { __mode = "k" }),
	},
}
local rebelTorso = {
	Size = Vector3.new(111, 111, 111),
	Transparency = 0, -- 0 = normal, 1 = invisible (local only)
}
local rebelLabel -- set once the UI is created

local function getGroupTorsos(group)
	local list = {}
	for _, child in ipairs(workspace:GetChildren()) do
		if matches(child, group.Keywords) then
			local torso = child:FindFirstChild(REBEL_TORSO_NAME)
			if torso and torso:IsA("BasePart") then
				table.insert(list, torso)
			end
		end
	end
	return list
end

local function updateRebelLabel()
	if not rebelLabel then return end
	local texts = {}
	for _, group in ipairs(rebelGroups) do
		local resized = 0
		for torso in pairs(group.Saved) do
			if torso.Parent then resized += 1 end
		end
		table.insert(texts, string.format("%s: %d found, %d resized", group.Name, #getGroupTorsos(group), resized))
	end
	rebelLabel:Set(table.concat(texts, "  •  ")
		.. string.format("  •  Size: %g x %g x %g", rebelTorso.Size.X, rebelTorso.Size.Y, rebelTorso.Size.Z))
end

local function applyRebelTorso(group, torso)
	if group.Enabled then
		if group.Saved[torso] == nil then
			group.Saved[torso] = torso.Size -- remember the original
		end
		torso.Size = rebelTorso.Size
	end
	if rebelTorso.Transparency > 0 then
		torso.LocalTransparencyModifier = rebelTorso.Transparency
	end
end

-- Returns how many torsos got resized (or restored)
local function setGroupResized(group, enabled)
	group.Enabled = enabled
	local n = 0
	if enabled then
		for _, torso in ipairs(getGroupTorsos(group)) do
			if group.Saved[torso] == nil then
				group.Saved[torso] = torso.Size
			end
			torso.Size = rebelTorso.Size
			n += 1
		end
	else
		for torso, original in pairs(group.Saved) do
			if torso.Parent then
				torso.Size = original -- back to default
				n += 1
			end
		end
		table.clear(group.Saved)
	end
	updateRebelLabel()
	return n
end

local function applyRebelTransparency()
	for _, group in ipairs(rebelGroups) do
		for _, torso in ipairs(getGroupTorsos(group)) do
			torso.LocalTransparencyModifier = rebelTorso.Transparency -- 0 = normal
		end
	end
end

-- Rebels / Commander Pebbles that spawn later get the same treatment
workspace.ChildAdded:Connect(function(child)
	local active = rebelTorso.Transparency > 0
	for _, group in ipairs(rebelGroups) do
		active = active or group.Enabled
	end
	if not active then return end

	task.wait() -- let it finish loading (and get its name)
	if child.Parent ~= workspace then return end
	local owners = {}
	for _, group in ipairs(rebelGroups) do
		if matches(child, group.Keywords) then
			table.insert(owners, group)
		end
	end
	if #owners == 0 then return end

	local torso = child:WaitForChild(REBEL_TORSO_NAME, 5)
	if torso and torso:IsA("BasePart") and child.Parent == workspace then
		for _, group in ipairs(owners) do
			applyRebelTorso(group, torso)
		end
		updateRebelLabel()
	end
end)

local RebelTab = Window:CreateTab("Rebel Torso", 4483362458)

RebelTab:CreateSection("Torso of every Rebel / RBL-R in workspace")

rebelLabel = RebelTab:CreateLabel("Rebels found: 0")
updateRebelLabel()

for _, group in ipairs(rebelGroups) do
	RebelTab:CreateToggle({
		Name = "Resize " .. group.Name .. " Torso",
		CurrentValue = false,
		Flag = group.Flag,
		Callback = function(value)
			local n = setGroupResized(group, value)
			Rayfield:Notify({
				Title = group.Name .. " Torso",
				Content = value
					and (n > 0
						and ("Resized " .. n .. " torso(s). New ones are resized when they spawn.")
						or ("No " .. group.Name .. " with a Torso in workspace right now. New ones will be resized when they spawn."))
					or ("Restored " .. n .. " torso(s) to their original size."),
				Duration = 4,
			})
		end,
	})
end

for _, axis in ipairs({ "X", "Y", "Z" }) do
	RebelTab:CreateInput({
		Name = "Size " .. axis,
		CurrentValue = "111",
		PlaceholderText = "111",
		RemoveTextAfterFocusLost = false,
		Flag = "RebelTorsoSize" .. axis,
		Callback = function(text)
			local v = tonumber(text)
			if not v then return end
			local s = rebelTorso.Size
			local comps = { X = s.X, Y = s.Y, Z = s.Z }
			comps[axis] = math.clamp(v, 0.05, 2048) -- Roblox part size limits
			rebelTorso.Size = Vector3.new(comps.X, comps.Y, comps.Z)

			for _, group in ipairs(rebelGroups) do
				if group.Enabled then
					for torso in pairs(group.Saved) do
						if torso.Parent then
							torso.Size = rebelTorso.Size
						end
					end
				end
			end
			updateRebelLabel()
		end,
	})
end

RebelTab:CreateSlider({
	Name = "Rebel Torso Transparency",
	Range = { 0, 1 },
	Increment = 0.05,
	CurrentValue = rebelTorso.Transparency,
	Flag = "RebelTorsoTransparency",
	Callback = function(value)
		rebelTorso.Transparency = value
		applyRebelTransparency()
	end,
})

