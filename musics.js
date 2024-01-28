const dbconnect = require("./db-connect");
const jwt = require("jsonwebtoken");
const { tokenKey } = require("./keys");
const fs = require("fs-extra");
const { getFileSizeInMegabytes } = require("./functions");
const he = require("he");
const crypto = require("crypto");
const path = require("path");
const formidable = require("formidable");
const { verifyAuthToken } = require("./accounts");

const imageExt = ["jpg", "jpeg", "png"];

const musicExt = ["mp3", "wav", "flac"];

var musicUID;

var user = "monarn";

const handleError = (req, res, err) => {
  if (err) {
    return res.status(400).json({
      success: false,
      message: "Il y a un problème avec un des fichiers",
    });
  }
};

const uploadMusic = async (req, res) => {
  try {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Erreur lors de l'analyse du formulaire" + err,
        });
      }

      const name = fields.name[0];
      const genre = fields.genre[0];
      const accessToken = fields.accessToken[0];

      const payload = jwt.verify(accessToken, tokenKey);

      const { canarnDB, client } = await dbconnect.connectMusicDB();

      const musics = canarnDB.collection("musics");
      const users = canarnDB.collection("users");

      const musicImage = files["music-image"][0];
      const musicSong = files["music-song"][0];

      const admin = await users.findOne({ userUID: payload.userUID });

      if (!name || !genre || !musicImage || !musicSong) {
        return res.status(400).json({
          success: false,
          message: "Tous les champs doivent être complétés",
        });
      }

      if (!payload.admin) {
        return res.status(401).json({
          success: false,
          message: `L'utilisateur ${accessToken} n'est pas administrateur`,
        });
      }

      if (musicImage.size / (1024 * 1024) >= 3) {
        return res.status(400).json({
          success: false,
          message: `Le fichier ${musicImage.filename} est trop lourd (< 3 Mo)`,
        });
      }

      if (musicSong.size / (1024 * 1024) >= 10) {
        return res.status(400).json({
          success: false,
          message: `Le fichier ${musicSong.filename} est trop lourd (< 10 Mo)`,
        });
      }

      if (
        musicImage.mimetype.substring(0, 5) !== "image" ||
        musicSong.mimetype.substring(0, 5) !== "audio"
      ) {
        return res.status(400).json({
          success: false,
          message: `Le ou les fichiers n'ont pas la bonne extension ${imageExt} ou ${musicExt}`,
        });
      }

      musicUID = crypto.randomBytes(30).toString("hex");

      const directory = `/var/www/canarn/build/musics`;

      form.uploadDir = `${directory}/${musicUID}`;
      form.multiples = true;

      // MUSIC SCHEME
      const newMusic = {
        title: name,
        author: admin.pseudo,
        authorUID: admin.userUID,
        genre: genre,
        imagePath: `musics/${musicUID}/${name}-image${path.extname(
          musicImage.originalFilename
        )}`,
        musicPath: `musics/${musicUID}/${name}-song${path.extname(
          musicSong.originalFilename
        )}`,
        musicUID: musicUID,
        date: new Date(),
      };

      fs.mkdirSync(`${directory}/${musicUID}`, { recursive: true });
      const rawMusic = fs.readFileSync(musicSong.filepath);
      const rawImage = fs.readFileSync(musicImage.filepath);

      fs.writeFile(
        `${directory}/${musicUID}/${name}-image${path.extname(
          musicImage.originalFilename
        )}`,
        rawImage,
        handleError
      );
      fs.writeFile(
        `${directory}/${musicUID}/${name}-song${path.extname(
          musicSong.originalFilename
        )}`,
        rawMusic,
        handleError
      );
      await musics.insertOne(newMusic);

      client.close();

      res.status(200).json({
        success: true,
        message: "La prod est publiée",
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        "Une erreur s'est produite lors de l'upload de la musique" +
        error,
    });
  }
};

const getMusic = async (req, res) => {
  try {
    const { canarnDB, client } = await dbconnect.connectMusicDB();

    const musics = canarnDB.collection("musics")

    const musicRes = await musics.findOne({ musicUID: req.query.musicUID })

    const song = "/var/www/canarn/build/" + musicRes.musicPath;
    const image = "/var/www/canarn/build/" + musicRes.imagePath;

    if (req.query.type === "song") {
      res.attachment(req.query.musicUID);
      res.sendFile(song, (err) => {
        if (err) {
          return;
        }
      })
      client.close();
      return;
    } else if (req.query.type === "image") {
      res.attachment("image");
      res.sendFile(image, (err) => {

        return;
      }
      )
      client.close();
      return;
    } else {
      res.status(200).json({
        success: true,
        message: 'Les fichers ont été envoyés avec succès'
      })

      client.close()

    }


  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message,
    })
  }
}

const fetchMusic = async (req, res) => {
  try {
    const { canarnDB, client } = await dbconnect.connectMusicDB();

    const musics = canarnDB.collection("musics");
    const likes = canarnDB.collection("likes");

    if (req.query.musicUID) {
      const musicUID = req.query.musicUID;
      const musicRes = await musics.findOne({ musicUID: musicUID });

      if (!musicRes) {
        return res.status(400).json({
          success: false,
          message: "Aucune musique trouvée",
        });
      }
      client.close();

      return res.status(200).json({
        success: true,
        message: "Musique trouvée",
        music: musicRes,
      });
    }

    if (req.query.likes) {
      const userLikes = req.query.likes;
      const likedMusics = await likes
        .find({ userUID: userLikes })
        .toArray();

      const musicUIDs = likedMusics.map(
        (likedMusic) => likedMusic.musicUID
      );

      const fetchedMusics = await musics
        .find({ musicUID: { $in: musicUIDs } })
        .toArray();

      client.close();

      if (likedMusics.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Aucune musique trouvée",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Musiques trouvées",
        music: fetchedMusics,
      });
    }

    if (req.query.author) {
      const author = req.query.author;
      const musicRes = await musics.find({ author: author }).toArray();

      client.close();

      if (musicRes.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Aucune musique trouvée",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Musiques trouvées",
        music: musicRes,
      });
    }

    if (req.query.authorUID) {
      const authorUID = req.query.authorUID;
      const musicRes = await musics
        .find({ authorUID: authorUID })
        .toArray();

      client.close();

      if (musicRes.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Aucune musique trouvée",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Musiques trouvées",
        music: musicRes,
      });
    }

    res.status(400).json({
      success: false,
      message: "Il y a un problème avec la requête",
    });

    client.close();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Une erreur est survenue" + error,
    });
  }
};

const fetchQueue = async (req, res) => {
  try {
    const { canarnDB, client } = await dbconnect.connectMusicDB();
    const musics = canarnDB.collection("musics");

    const totalNumber = await musics.countDocuments();
    const returnNumber = Math.min(totalNumber, req.query.count);

    const queue = await musics
      .aggregate([
        { $match: { musicUID: { $ne: req.query.musicUID } } },
        { $sample: { size: returnNumber } },
      ])
      .toArray();

    res.status(200).json({ success: true, queue: queue });
    client.close();
  } catch (e) {
    res.status(400).json({
      success: false,
      message: "Une erreur s'est produite" + e,
    });
  }
};

const deleteMusic = async (req, res) => {
  try {
    const { canarnDB, client } = await dbconnect.connectMusicDB();

    const refreshToken = req.cookies.refreshToken;

    const payload = jwt.verify(refreshToken, tokenKey);

    const musics = canarnDB.collection("musics");

    const musicUID = req.query.musicUID;

    const musicToDelete = await musics.findOne({ musicUID: musicUID });

    if (!musicToDelete) {
      return res.status(400).json({
        success: false,
        message: "La musique n'existe pas",
      });
    }

    if (!payload.admin) {
      return res.status(401).json({
        success: false,
        message: `L'utilisateur ${accessToken} n'est pas administrateur`,
      });
    }

    await musics.deleteOne({ musicUID: musicUID });

    fs.remove(`musics/${musicToDelete.musicUID}`);

    res.status(200).json({
      success: true,
      message: `La musique ${musicToDelete.title} a été correctement supprimée`,
    });

    client.close();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Une erreur s'est produite " + error,
    });
  }
};

const likeMusic = async (req, res) => {
  try {
    const { musicUID, action, accessToken } = req.query;

    const { canarnDB, client } = await dbconnect.connectMusicDB();
    const likes = canarnDB.collection("likes");

    const musicLike = likes.find({ musicUID: musicUID });

    if (action === "verify" || action === "like") {
      const payload = jwt.verify(accessToken, tokenKey);
      const userUID = payload.userUID;
      const isLiked = await likes.findOne({
        musicUID: musicUID,
        userUID: userUID,
      });

      if (action === "verify") {
        return res.status(200).json({
          success: true,
          message: isLiked ? true : false,
        });
      }

      if (action === "like") {
        const payload = jwt.verify(accessToken, tokenKey);
        const userUID = payload.userUID;
        const isLiked = await likes.findOne({
          musicUID: musicUID,
          userUID: userUID,
        });
        if (isLiked) {
          await likes.deleteOne({
            musicUID: musicUID,
            userUID: userUID,
          });
        } else {
          await likes.insertOne({
            musicUID: musicUID,
            userUID: userUID,
          });
        }

        return res.status(200).json({
          success: true,
          message:
            "Le like bien été pris en compte " + isLiked
              ? "(unliked)"
              : "(liked)",
        });
      }
    }
    if (action === "number") {
      const musicLikeArray = await musicLike.toArray();

      const count = musicLikeArray.length;
      return res.status(200).json({
        success: true,
        message: count,
      });
    }

    client.close();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Une erreur est survenue" + error,
    });
  }
};

module.exports = {
  uploadMusic,
  fetchMusic,
  likeMusic,
  fetchQueue,
  deleteMusic,
  getMusic,
};
