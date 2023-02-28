const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;
let initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("The server has been started");
    });
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
};
initializeDBAndServer();

let convertStateObjToCamelCase = (eachObj) => {
  return {
    stateId: eachObj.state_id,
    stateName: eachObj.state_name,
    population: eachObj.population,
  };
};

let validateJWTToken = (req, res, next) => {
  let authHeader = req.headers.authorization;
  let jswToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  //console.log(jwtToken);
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "shravan", async (error, user) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//API 8 /states/:stateId/stats/
app.get("/states/:stateId/stats/", validateJWTToken, async (req, res) => {
  let { stateId } = req.params;
  console.log(stateId);
  let statsQuery = `
    SELECT SUM(cases) AS totalCases, SUM(cured) AS cured, 
        SUM(active) AS totalActive, SUM(deaths) AS totalDeaths 
    FROM state NATURAL JOIN district 
    WHERE state_id = ${stateId}`;
  let dbResponse = await db.get(statsQuery);
  res.send(dbResponse);
});

//API 7 /districts/:districtId/
app.put("/districts/:districtId/", validateJWTToken, async (req, res) => {
  let { districtId } = req.params;
  let { districtName, stateId, cases, cured, active, deaths } = req.body;

  let putQuery = `
    UPDATE district 
    SET 
        district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
    WHERE 
        district_id = ${districtId};`;
  let dbResponse = await db.run(putQuery);
  res.send("District Details Updated");
});

//API 6 DELETE /districts/:districtId/
app.delete("/districts/:districtId/", validateJWTToken, async (req, res) => {
  let { districtId } = req.params;
  let deleteQuery = `
    DELETE FROM district 
    WHERE district_id = ${districtId};`;
  let deleteResponse = await db.run(deleteQuery);
  res.send("District Removed");
});

//API5 /districts/:districtId/
app.get("/districts/:districtId/", validateJWTToken, async (req, res) => {
  let { districtId } = req.params;
  let getDistrictQuery = `
    SELECT * FROM district 
    WHERE district_id = ${districtId};`;
  let dbResponse = await db.get(getDistrictQuery);
  res.send(dbResponse);
});

//API 4districts/
app.post("/districts/", validateJWTToken, async (req, res) => {
  let { districtName, stateId, cases, cured, active, deaths } = req.body;
  console.log(req.body);
  let postQuery = `
  INSERT INTO district(district_name, state_id, cases, cured, active, deaths) 
  VALUES (
      '${districtName}',
      ${stateId},
      ${cases},
      ${cured},
      ${active},
      ${deaths}
  );`;
  let dbResponse = await db.run(postQuery);
  res.send("District Successfully Added");
});

//API GET /states/:stateId/
app.get("/states/:stateId/", validateJWTToken, async (req, res) => {
  let { stateId } = req.params;
  let getStatesQuery = `
              SELECT * FROM state
              WHERE state_id = ${stateId};
              `;
  let getState = await db.get(getStatesQuery);
  let newStateObj = convertStateObjToCamelCase(getState);
  res.send(convertStateObjToCamelCase(getState));
});

//API GET /states/
app.get("/states/", validateJWTToken, async (req, res) => {
  let getStatesQuery = `
              SELECT * FROM state;
              `;
  let getStates = await db.all(getStatesQuery);
  res.send(
    getStates.map((eachObj) => {
      return convertStateObjToCamelCase(eachObj);
    })
  );
});

//API1 /login/
app.post("/login/", async (req, res) => {
  let { username, password } = req.body;
  //console.log(username, password);

  let checkForUserQuery = `
  SELECT * FROM user
  WHERE 
    username = '${username}';
  `;
  let dbResponse = await db.get(checkForUserQuery);

  if (dbResponse !== undefined) {
    let checkPassword = await bcrypt.compare(password, dbResponse.password);

    if (checkPassword === true) {
      let payload = { username: username };
      let jwtToken = jwt.sign(payload, "shravan");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  } else {
    res.status(400);
    res.send("Invalid user");
  }
});

//API change-password
app.post("/change-password", async (req, res) => {
  let { username, oldPassword, newPassword } = req.body;
  let checkForUserQuery = `
    SELECT * FROM user
    WHERE 
        username = '${username}';
  `;
  let selectedUser = await db.get(checkForUserQuery);
  //console.log(selectedUser);
  if (selectedUser !== undefined) {
    //console.log("This is if block");
    let comparePassword = await bcrypt.compare(
      oldPassword,
      selectedUser.password
    );
    console.log(comparePassword);
    if (comparePassword === true) {
      if (newPassword.length < 5) {
        res.status(400);
        res.send("Password is too short");
      } else {
        let hashedNewPassword = await bcrypt.hash(newPassword, 10);
        let changePasswordQuery = `
            UPDATE user
            SET
                password = '${hashedNewPassword}'
            WHERE 
                username = '${username}';`;
        let changePassword = await db.run(changePasswordQuery);
        res.send("Password updated");
      }
    } else {
      res.status(400);
      res.send("Password didn't match");
    }
  } else {
    res.status(400);
    res.send("User not found");
  }
});

//API Register
app.post("/register", async (req, res) => {
  let { username, name, password, gender, location } = req.body;
  let checkForUserExistQuery = `
    SELECT * FROM user
    WHERE 
        username = '${username}';
    `;
  let runCheckUser = await db.get(checkForUserExistQuery);
  if (runCheckUser !== undefined) {
    res.status(400);
    res.send("User Already Exists");
  } else {
    if (password.length < 5) {
      res.status(400);
      res.send("Password is too short");
    } else {
      let hashedPassword = await bcrypt.hash(password, 10);
      let createUserQuery = `
            INSERT INTO user(username, name, password, gender, location) 
            VALUES(
                '${username}',
                '${name}',
                '${hashedPassword}',
                '${gender}',
                '${location}'
            );`;
      let createUser = await db.run(createUserQuery);
      res.send("User Created Successfully");
    }
  }
});

module.exports = app;
